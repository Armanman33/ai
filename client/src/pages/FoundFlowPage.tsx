import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Camera,
  CheckCircle2,
  ShieldAlert,
  Sparkles,
  Truck,
  Building2,
  ArrowRight,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { apiFetch } from '../lib/api';
import { usePageSeo } from '../lib/seo';
import { ItemCategory } from '../types';
import { TehranMap } from '../components/TehranMap';
import { LoadingSkeleton, PageHeader } from '../components/StateViews';
import { toPersianDigits } from '../lib/persian';

function currentLocalDateTimeInput(): string {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 16);
}

export const FoundFlowPage: React.FC = () => {
  const { meta, user, refreshMe } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  usePageSeo({
    title: 'پیدا کرده‌ام | ثبت سریع شیء پیدا شده در تهران — چی‌کجا',
    description:
      'وسیله‌ای در تهران پیدا کرده‌اید؟ در کمتر از یک دقیقه بدون نمایش شماره تماس و با ۳ پرسش محرمانه آن را در چی‌کجا ثبت کنید و امن با پیک یا نقطه امن تحویل دهید.',
    canonicalPath: '/found',
  });

  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1: Fast minimal item details
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [category, setCategory] = useState<ItemCategory>('bag');
  const [title, setTitle] = useState('');
  const [lat, setLat] = useState(35.7575);
  const [lng, setLng] = useState(51.4100);
  const [areaName, setAreaName] = useState('میدان ونک');
  const [foundAtLocal, setFoundAtLocal] = useState(currentLocalDateTimeInput);

  // Step 2: Exactly 3 secret questions & answers
  const [questions, setQuestions] = useState<
    [{ q: string; a: string }, { q: string; a: string }, { q: string; a: string }]
  >([
    { q: '', a: '' },
    { q: '', a: '' },
    { q: '', a: '' },
  ]);

  // Step 3: Delivery method (Courier or Safe Point ONLY)
  const [deliveryMethod, setDeliveryMethod] = useState<'courier' | 'safe_point'>('courier');
  const [safePointId, setSafePointId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const selectedCategoryMeta = useMemo(
    () => meta?.categories.find((c) => c.id === category) || null,
    [meta, category]
  );

  const isSafePointOnly = Boolean(selectedCategoryMeta?.safePointOnly);

  const handleCategoryChange = (nextCat: ItemCategory) => {
    setCategory(nextCat);
    const catObj = meta?.categories.find((c) => c.id === nextCat);
    if (catObj?.safePointOnly) {
      setDeliveryMethod('safe_point');
      if (!safePointId && meta?.safePoints[0]) {
        setSafePointId(meta.safePoints[0].id);
      }
    }
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      showToast('فقط فرمت‌های تصویر JPG، PNG و WebP مجاز هستند.', 'error');
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      showToast('حجم تصویر نباید بیشتر از ۶ مگابایت باشد.', 'error');
      return;
    }
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(String(reader.result));
    reader.readAsDataURL(file);
  };

  const applySuggestedQuestion = (text: string) => {
    // Prevent duplicate suggestion
    if (questions.some((item) => item.q.trim() === text.trim())) {
      showToast('این پرسش قبلاً اضافه شده است.', 'info');
      return;
    }
    const emptyIdx = questions.findIndex((item) => !item.q.trim());
    const targetIdx = emptyIdx !== -1 ? emptyIdx : 2;
    const next = [...questions] as typeof questions;
    next[targetIdx] = { ...next[targetIdx], q: text };
    setQuestions(next);
  };

  const validateStep1 = (): boolean => {
    if (!photoFile) {
      showToast('بارگذاری عکس شیء پیدا شده الزامی است.', 'error');
      return false;
    }
    if (title.trim().length < 3) {
      showToast('لطفاً عنوان کوتاه شیء را وارد کنید (حداقل ۳ حرف).', 'error');
      return false;
    }
    return true;
  };

  const validateStep2 = (): boolean => {
    for (let i = 0; i < 3; i++) {
      if (questions[i].q.trim().length < 4) {
        showToast(`لطفاً متن پرسش شماره ${toPersianDigits(i + 1)} را کامل بنویسید.`, 'error');
        return false;
      }
      if (!questions[i].a.trim()) {
        showToast(`لطفاً پاسخ محرمانه پرسش شماره ${toPersianDigits(i + 1)} را وارد کنید.`, 'error');
        return false;
      }
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      showToast('برای ثبت آگهی ابتدا وارد حساب کاربری خود شوید.', 'info');
      navigate('/auth', { state: { from: '/found' } });
      return;
    }
    if (!validateStep1() || !validateStep2()) return;

    const finalMethod = isSafePointOnly ? 'safe_point' : deliveryMethod;
    const chosenSafePoint =
      finalMethod === 'safe_point' ? safePointId || meta?.safePoints[0]?.id || '' : '';

    if (finalMethod === 'safe_point' && !chosenSafePoint) {
      showToast('لطفاً یک نقطه امن در تهران انتخاب کنید.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('photo', photoFile!);
      fd.append('title', title.trim());
      fd.append('category', category);
      fd.append('areaName', areaName);
      fd.append('lat', String(lat));
      fd.append('lng', String(lng));
      fd.append('foundAt', new Date(foundAtLocal).toISOString());
      fd.append('deliveryMethod', finalMethod);
      if (chosenSafePoint) fd.append('safePointId', chosenSafePoint);
      fd.append(
        'questions',
        JSON.stringify(
          questions.map((item) => ({
            question: item.q.trim(),
            answer: item.a.trim(),
          }))
        )
      );

      const res = await apiFetch<{ ok: boolean; itemId: string; matchedAlerts: number }>('/api/items', {
        method: 'POST',
        body: fd,
      });

      await refreshMe();
      showToast(
        res.matchedAlerts > 0
          ? `آگهی ثبت شد و برای ${toPersianDigits(res.matchedAlerts)} کاربر با هشدار مشابه اعلان ارسال گردید.`
          : 'آگهی شما با موفقیت ثبت شد (مدت اعتبار: ۳ روز).',
        'success'
      );
      navigate('/my-ads');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'خطا در ثبت آگهی', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!meta) return <LoadingSkeleton rows={3} />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="ثبت شیء پیدا شده"
        subtitle="سریع، ساده و بدون فرم‌های پیچیده — ویژه شهر تهران"
        backTo="/"
      />

      {!user && (
        <div className="bg-[#FEFCE8] border border-[#FACC15] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <span className="text-xs sm:text-sm font-semibold text-[#0A0A0A]">
            برای ثبت نهایی شیء پیدا شده و دریافت پیامک درخواست مالک، ورود با شماره موبایل لازم است.
          </span>
          <button
            type="button"
            onClick={() => navigate('/auth', { state: { from: '/found' } })}
            className="bg-[#0A0A0A] text-[#FACC15] text-xs font-bold px-4 py-2 rounded-xl shrink-0"
          >
            ورود سریع
          </button>
        </div>
      )}

      {/* 3-Step Progress Bar */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { num: 1 as const, label: 'مشخصات شیء' },
          { num: 2 as const, label: '۳ پرسش محرمانه' },
          { num: 3 as const, label: 'روش تحویل' },
        ].map((s) => (
          <button
            key={s.num}
            type="button"
            onClick={() => {
              if (s.num === 1) setStep(1);
              else if (s.num === 2 && validateStep1()) setStep(2);
              else if (s.num === 3 && validateStep1() && validateStep2()) setStep(3);
            }}
            className={`rounded-xl px-2.5 py-2.5 text-xs font-bold border transition-colors flex items-center justify-center gap-1.5 ${
              step === s.num
                ? 'bg-[#0A0A0A] text-[#FACC15] border-[#0A0A0A]'
                : step > s.num
                  ? 'bg-[#FEF9C3] text-[#0A0A0A] border-[#FACC15]'
                  : 'bg-white text-neutral-500 border-neutral-200'
            }`}
          >
            <span className="font-black">{toPersianDigits(s.num)}.</span>
            <span className="truncate">{s.label}</span>
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* STEP 1: REGISTER FOUND ITEM */}
        {step === 1 && (
          <div className="space-y-4">
            {/* Photo Upload */}
            <div className="bg-white rounded-2xl border border-neutral-200 p-4 sm:p-5 space-y-3">
              <label className="block text-sm font-extrabold text-[#0A0A0A]">
                ۱. عکس شیء پیدا شده *
              </label>

              <label className="block border-2 border-dashed border-neutral-300 hover:border-[#0A0A0A] rounded-2xl p-4 text-center cursor-pointer transition-colors bg-neutral-50">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handlePhotoChange}
                  className="hidden"
                />
                {photoPreview ? (
                  <div className="space-y-2">
                    <img
                      src={photoPreview}
                      alt="پیش‌نمایش شیء"
                      className="w-full max-h-56 object-contain rounded-xl mx-auto"
                    />
                    <span className="inline-block text-xs font-bold text-[#0A0A0A] underline">
                      تغییر عکس
                    </span>
                  </div>
                ) : (
                  <div className="py-5 flex flex-col items-center gap-2">
                    <div className="w-12 h-12 rounded-2xl bg-[#FACC15] text-[#0A0A0A] flex items-center justify-center">
                      <Camera className="w-6 h-6" />
                    </div>
                    <span className="text-sm font-bold text-[#0A0A0A]">
                      انتخاب یا گرفتن عکس از شیء
                    </span>
                    <span className="text-xs text-neutral-500">
                      تصویر به‌صورت خودکار تا پیش از تأیید مالکیت محو می‌شود
                    </span>
                  </div>
                )}
              </label>
            </div>

            {/* Category & Short Title */}
            <div className="bg-white rounded-2xl border border-neutral-200 p-4 sm:p-5 space-y-4">
              <div>
                <label className="block text-sm font-extrabold text-[#0A0A0A] mb-2">
                  ۲. دسته‌بندی *
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {meta.categories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => handleCategoryChange(cat.id)}
                      className={`p-2.5 rounded-xl border text-xs font-bold transition-colors text-center ${
                        category === cat.id
                          ? 'bg-[#FACC15] border-[#0A0A0A] text-[#0A0A0A]'
                          : 'bg-neutral-50 border-neutral-200 text-neutral-700 hover:border-neutral-400'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {isSafePointOnly && (
                <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 text-xs text-amber-950 flex items-start gap-2 leading-5">
                  <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <span>
                    برای حفاظت از مدارک شناسایی و کارت‌های بانکی، تصویر به‌طور کامل محو می‌شود و تحویل فقط از طریق نقطه امن انجام می‌گیرد. از ثبت شماره کارت یا کد ملی در عنوان خودداری کنید.
                  </span>
                </div>
              )}

              <div>
                <label className="block text-sm font-extrabold text-[#0A0A0A] mb-1.5">
                  ۳. عنوان کوتاه *
                </label>
                <input
                  type="text"
                  required
                  minLength={3}
                  maxLength={100}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="مثلاً: کیف دوشی چرم در میدان ونک"
                  className="w-full bg-neutral-50 border border-neutral-300 focus:border-[#0A0A0A] focus:bg-white rounded-xl px-4 py-3 text-sm outline-none"
                />
                <p className="text-[11px] text-neutral-500 mt-1">
                  نکته: ویژگی‌های محرمانه‌ای که قرار است در ۳ پرسش بپرسید را در عنوان ننویسید.
                </p>
              </div>
            </div>

            {/* Auto Location & Auto Time */}
            <div className="bg-white rounded-2xl border border-neutral-200 p-4 sm:p-5 space-y-4">
              <div>
                <label className="block text-sm font-extrabold text-[#0A0A0A] mb-2">
                  ۴. موقعیت پیدا شدن در تهران *
                </label>
                <TehranMap
                  lat={lat}
                  lng={lng}
                  areaName={areaName}
                  places={meta.places}
                  bounds={meta.bounds}
                  autoLocateOnMount
                  heightClass="h-56"
                  onChange={(next) => {
                    setLat(next.lat);
                    setLng(next.lng);
                    setAreaName(next.areaName);
                  }}
                />
              </div>

              <div>
                <label className="block text-sm font-extrabold text-[#0A0A0A] mb-1.5">
                  ۵. زمان پیدا شدن (ثبت‌شده به‌صورت خودکار)
                </label>
                <input
                  type="datetime-local"
                  dir="ltr"
                  required
                  value={foundAtLocal}
                  onChange={(e) => setFoundAtLocal(e.target.value)}
                  className="w-full bg-neutral-50 border border-neutral-300 focus:border-[#0A0A0A] rounded-xl px-4 py-2.5 text-sm outline-none text-left"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                if (validateStep1()) setStep(2);
              }}
              className="w-full bg-[#FACC15] hover:bg-[#EAB308] text-[#0A0A0A] font-black text-base py-4 rounded-2xl shadow-md transition-colors"
            >
              مرحله بعد: طراحی ۳ پرسش محرمانه
            </button>
          </div>
        )}

        {/* STEP 2: DESIGN 3 SECRET QUESTIONS */}
        {step === 2 && (
          <div className="space-y-4">
            {/* Short privacy guidance */}
            <div className="bg-[#0A0A0A] text-white rounded-2xl p-4 border-2 border-[#FACC15] flex items-start gap-3">
              <Lock className="w-5 h-5 text-[#FACC15] shrink-0 mt-0.5" />
              <div className="text-xs sm:text-sm leading-6">
                <strong className="text-[#FACC15] block mb-0.5">راهنمای پرسش‌های محرمانه:</strong>
                پاسخ این سه پرسش نباید در تصویر یا عنوان عمومی آگهی مشخص باشد. پاسخ‌ها کاملاً محرمانه نزد سرور نگهداری می‌شوند و فقط صاحب واقعی شیء می‌تواند به هر سه پاسخ دهد.
              </div>
            </div>

            {/* Category-based Suggested Questions */}
            {selectedCategoryMeta && (
              <div className="bg-white rounded-2xl border border-neutral-200 p-4 space-y-2.5">
                <div className="flex items-center gap-1.5 text-xs font-extrabold text-[#0A0A0A]">
                  <Sparkles className="w-4 h-4 text-[#CA8A04]" />
                  <span>پرسش‌های پیشنهادی برای «{selectedCategoryMeta.label}» (برای افزودن ضربه بزنید):</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedCategoryMeta.suggestedQuestions.map((sq) => (
                    <button
                      key={sq}
                      type="button"
                      onClick={() => applySuggestedQuestion(sq)}
                      className="text-xs bg-[#FEFCE8] hover:bg-[#FACC15] border border-[#FDE047] text-[#0A0A0A] font-semibold px-3 py-2 rounded-xl transition-colors text-right"
                    >
                      + {sq}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 3 Mandatory Question + Secret Answer Cards */}
            <div className="space-y-3">
              {questions.map((item, idx) => (
                <div
                  key={idx}
                  className="bg-white rounded-2xl border border-neutral-200 p-4 space-y-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-xl bg-[#0A0A0A] text-[#FACC15] text-xs font-black flex items-center justify-center">
                      {toPersianDigits(idx + 1)}
                    </span>
                    <span className="text-sm font-extrabold text-[#0A0A0A]">
                      پرسش محرمانه شماره {toPersianDigits(idx + 1)} (الزامی)
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-600 mb-1">
                      متن پرسش (قابل ویرایش)
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={200}
                      value={item.q}
                      onChange={(e) => {
                        const next = [...questions] as typeof questions;
                        next[idx] = { ...next[idx], q: e.target.value };
                        setQuestions(next);
                      }}
                      placeholder="یک سؤال مشخص درباره ویژگی پنهان شیء بنویسید..."
                      className="w-full bg-neutral-50 border border-neutral-300 focus:border-[#0A0A0A] focus:bg-white rounded-xl px-3.5 py-2.5 text-sm outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-600 mb-1">
                      پاسخ صحیح (محرمانه — برای هیچ کاربری نمایش داده نمی‌شود)
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={120}
                      value={item.a}
                      onChange={(e) => {
                        const next = [...questions] as typeof questions;
                        next[idx] = { ...next[idx], a: e.target.value };
                        setQuestions(next);
                      }}
                      placeholder="پاسخ کوتاه و دقیق (مثلاً: قرمز، عینک آفتابی، ۴)"
                      className="w-full bg-[#FEFCE8] border border-[#EAB308] focus:border-[#0A0A0A] rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-5 bg-white border border-neutral-300 text-[#0A0A0A] font-bold text-sm rounded-2xl inline-flex items-center gap-1.5"
              >
                <ArrowRight className="w-4 h-4" />
                قبلی
              </button>
              <button
                type="button"
                onClick={() => {
                  if (validateStep2()) {
                    if (isSafePointOnly && !safePointId && meta.safePoints[0]) {
                      setSafePointId(meta.safePoints[0].id);
                    }
                    setStep(3);
                  }
                }}
                className="flex-1 bg-[#FACC15] hover:bg-[#EAB308] text-[#0A0A0A] font-black text-base py-4 rounded-2xl shadow-md"
              >
                مرحله بعد: انتخاب روش تحویل
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: STORAGE & DELIVERY METHOD */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-neutral-200 p-4 sm:p-5 space-y-4">
              <h2 className="text-base font-extrabold text-[#0A0A0A]">
                انتخاب روش نگهداری و تحویل (۲ روش مجاز)
              </h2>

              {isSafePointOnly && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3.5 text-xs text-red-900 font-bold leading-6">
                  برای مدارک شناسایی و کارت‌های بانکی، تحویل فقط از طریق نقطه امن انجام می‌شود.
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Option 1: Courier */}
                <button
                  type="button"
                  disabled={isSafePointOnly}
                  onClick={() => setDeliveryMethod('courier')}
                  className={`p-4 rounded-2xl border-2 text-right space-y-2 transition-all ${
                    isSafePointOnly
                      ? 'opacity-45 cursor-not-allowed bg-neutral-100 border-neutral-200'
                      : deliveryMethod === 'courier'
                        ? 'border-[#0A0A0A] bg-[#FEFCE8]'
                        : 'border-neutral-200 bg-white hover:border-neutral-400'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-[#0A0A0A] text-[#FACC15] flex items-center justify-center">
                      <Truck className="w-5 h-5" />
                    </div>
                    {deliveryMethod === 'courier' && !isSafePointOnly && (
                      <CheckCircle2 className="w-5 h-5 text-[#0A0A0A]" />
                    )}
                  </div>
                  <div className="text-sm font-black text-[#0A0A0A]">۱. ارسال با پیک</div>
                  <ul className="text-xs text-neutral-600 space-y-1 leading-5">
                    <li>• شیء را تا تأیید مالکیت نزد خود نگه می‌دارید</li>
                    <li>• هزینه پیک بر عهده گم‌کننده است</li>
                    <li>• نشانی فقط در اختیار پیک مجاز قرار می‌گیرد</li>
                  </ul>
                </button>

                {/* Option 2: Safe Point */}
                <button
                  type="button"
                  onClick={() => {
                    setDeliveryMethod('safe_point');
                    if (!safePointId && meta.safePoints[0]) {
                      setSafePointId(meta.safePoints[0].id);
                    }
                  }}
                  className={`p-4 rounded-2xl border-2 text-right space-y-2 transition-all ${
                    deliveryMethod === 'safe_point' || isSafePointOnly
                      ? 'border-[#0A0A0A] bg-[#FEFCE8]'
                      : 'border-neutral-200 bg-white hover:border-neutral-400'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-[#0A0A0A] text-[#FACC15] flex items-center justify-center">
                      <Building2 className="w-5 h-5" />
                    </div>
                    {(deliveryMethod === 'safe_point' || isSafePointOnly) && (
                      <CheckCircle2 className="w-5 h-5 text-[#0A0A0A]" />
                    )}
                  </div>
                  <div className="text-sm font-black text-[#0A0A0A]">۲. تحویل به نقطه امن</div>
                  <ul className="text-xs text-neutral-600 space-y-1 leading-5">
                    <li>• تحویل در ایستگاه مترو یا مرکز همکار در تهران</li>
                    <li>• ثبت دریافت توسط مسئول نقطه امن</li>
                    <li>• صدور رسید دیجیتال و کد یک‌بارمصرف</li>
                  </ul>
                </button>
              </div>

              {(deliveryMethod === 'safe_point' || isSafePointOnly) && (
                <div className="pt-2">
                  <label className="block text-xs font-bold text-[#0A0A0A] mb-1.5">
                    انتخاب نقطه امن در تهران *
                  </label>
                  <select
                    required
                    value={safePointId || meta.safePoints[0]?.id || ''}
                    onChange={(e) => setSafePointId(e.target.value)}
                    className="w-full bg-neutral-50 border border-neutral-300 focus:border-[#0A0A0A] rounded-xl px-3.5 py-3 text-sm outline-none"
                  >
                    {meta.safePoints.map((sp) => (
                      <option key={sp.id} value={sp.id}>
                        {sp.name} — {sp.area} ({sp.hours})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <p className="text-xs text-neutral-500 bg-neutral-50 rounded-xl p-3 leading-6">
                توجه: برای حفظ امنیت کاربران، گزینه دیدار حضوری و همچنین گذاشتن شیء در مکان عمومی و ارسال آدرس آن مجاز نیست. اعتبار آگهی ۳ روز است.
              </p>
            </div>

            {/* Security Advisory */}
            <div className="bg-[#0A0A0A] text-white rounded-2xl p-4 border-2 border-[#FACC15]">
              <div className="flex items-center gap-2 text-[#FACC15] font-bold text-sm mb-2">
                <ShieldCheck className="w-5 h-5 shrink-0" />
                <span>توصیه‌های امنیتی تحویل</span>
              </div>
              <p className="text-xs text-neutral-200 leading-6 whitespace-pre-line">
                {meta.rules.deliverySecurityAdvisory}
              </p>
            </div>

            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-5 bg-white border border-neutral-300 text-[#0A0A0A] font-bold text-sm rounded-2xl inline-flex items-center gap-1.5"
              >
                <ArrowRight className="w-4 h-4" />
                قبلی
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 bg-[#FACC15] hover:bg-[#EAB308] text-[#0A0A0A] font-black text-base py-4 rounded-2xl shadow-md transition-colors disabled:opacity-60"
              >
                {submitting ? 'در حال ثبت آگهی...' : 'ثبت نهایی شیء پیدا شده'}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
};
