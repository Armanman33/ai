import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  MapPin,
  Clock,
  SlidersHorizontal,
  BellRing,
  CheckCircle2,
  Calendar,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { apiFetch } from '../lib/api';
import { ItemCategory, SearchItem } from '../types';
import { TehranMap } from '../components/TehranMap';
import { ItemCard } from '../components/ItemCard';
import { EmptyState, ErrorState, LoadingSkeleton, PageHeader } from '../components/StateViews';
import {
  formatDistance,
  getRecentDateOptions,
  getTimeSlotLabel,
  TIME_SLOTS,
  toPersianDigits,
} from '../lib/persian';

const RADIUS_OPTIONS = [500, 1000, 2000, 3000, 5000, 10000];

export const LostFlowPage: React.FC = () => {
  const { meta, user, refreshMe } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const dateOptions = getRecentDateOptions();

  // Step 1 state: Location & Time in Tehran
  const [step, setStep] = useState<1 | 2>(1);
  const [lat, setLat] = useState(35.7575); // Vanak Sq default
  const [lng, setLng] = useState(51.4100);
  const [areaName, setAreaName] = useState('میدان ونک');
  const [radiusMeters, setRadiusMeters] = useState(3000);
  const [lostDate, setLostDate] = useState(dateOptions[0].value);
  const [timeSlot, setTimeSlot] = useState<'all_day' | 'morning' | 'noon' | 'evening' | 'night'>('all_day');
  const [useTimeFilter, setUseTimeFilter] = useState(false);

  // Step 2 state: Search & Alert creation
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ItemCategory | ''>('');
  const [items, setItems] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Alert creation panel
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertCategory, setAlertCategory] = useState<ItemCategory>('bag');
  const [alertSubmitting, setAlertSubmitting] = useState(false);

  const runSearch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('lat', String(lat));
      params.set('lng', String(lng));
      params.set('radiusMeters', String(radiusMeters));
      if (query.trim()) params.set('q', query.trim());
      if (category) params.set('category', category);
      if (useTimeFilter) {
        if (lostDate) params.set('lostDate', lostDate);
        if (timeSlot !== 'all_day') params.set('timeSlot', timeSlot);
      }

      const data = await apiFetch<{ items: SearchItem[] }>(`/api/items/search?${params.toString()}`);
      setItems(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در جست‌وجوی اشیا');
    } finally {
      setLoading(false);
    }
  }, [lat, lng, radiusMeters, query, category, useTimeFilter, lostDate, timeSlot]);

  useEffect(() => {
    if (step === 2) {
      void runSearch();
    }
  }, [step, runSearch]);

  const handleOpenAlertBox = () => {
    if (!user) {
      showToast('برای ثبت هشدار گم‌شدن ابتدا وارد حساب کاربری شوید.', 'info');
      navigate('/auth', { state: { from: '/lost' } });
      return;
    }
    setAlertTitle(query.trim());
    if (category) setAlertCategory(category);
    setAlertOpen(true);
  };

  const handleCreateAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!alertTitle.trim() || alertTitle.trim().length < 2) {
      showToast('لطفاً عنوان شیء گمشده را وارد کنید.', 'error');
      return;
    }
    setAlertSubmitting(true);
    try {
      await apiFetch('/api/alerts', {
        method: 'POST',
        body: JSON.stringify({
          title: alertTitle.trim(),
          category: alertCategory,
          areaName,
          lat,
          lng,
          radiusMeters,
          lostDate,
          timeSlot,
        }),
      });
      await refreshMe();
      showToast('هشدار ۵ روزه شما با موفقیت ثبت شد. در صورت ثبت مورد مشابه مطلع می‌شوید.', 'success');
      navigate('/my-alerts');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'خطا در ثبت هشدار', 'error');
    } finally {
      setAlertSubmitting(false);
    }
  };

  if (!meta) return <LoadingSkeleton rows={3} />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="گم کرده‌ام"
        subtitle={
          step === 1
            ? 'مرحله ۱ از ۲: محدوده و زمان تقریبی گم‌شدن در تهران'
            : 'مرحله ۲ از ۲: جست‌وجوی اشیای پیدا شده'
        }
        backTo="/"
      />

      {/* Step Indicator */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setStep(1)}
          className={`rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-bold border transition-colors text-right flex items-center gap-2 ${
            step === 1
              ? 'bg-[#0A0A0A] text-[#FACC15] border-[#0A0A0A]'
              : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-400'
          }`}
        >
          <span className="w-6 h-6 rounded-lg bg-[#FACC15] text-[#0A0A0A] flex items-center justify-center text-xs font-black shrink-0">
            ۱
          </span>
          <span>مکان و زمان در تهران</span>
        </button>
        <button
          type="button"
          onClick={() => setStep(2)}
          className={`rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-bold border transition-colors text-right flex items-center gap-2 ${
            step === 2
              ? 'bg-[#0A0A0A] text-[#FACC15] border-[#0A0A0A]'
              : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-400'
          }`}
        >
          <span
            className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${
              step === 2 ? 'bg-[#FACC15] text-[#0A0A0A]' : 'bg-neutral-200 text-neutral-700'
            }`}
          >
            ۲
          </span>
          <span>جست‌وجوی شیء</span>
        </button>
      </div>

      {/* STEP 1: LOCATION & TIME */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-neutral-200 p-4 sm:p-5 space-y-4">
            <h2 className="text-sm sm:text-base font-extrabold text-[#0A0A0A] flex items-center gap-2">
              <MapPin className="w-5 h-5 text-[#CA8A04]" />
              <span>محدوده احتمالی گم‌شدن در شهر تهران</span>
            </h2>

            <TehranMap
              lat={lat}
              lng={lng}
              areaName={areaName}
              radiusMeters={radiusMeters}
              places={meta.places}
              bounds={meta.bounds}
              onChange={(next) => {
                setLat(next.lat);
                setLng(next.lng);
                setAreaName(next.areaName);
              }}
            />

            {/* Radius Selector */}
            <div className="pt-2">
              <label className="block text-xs sm:text-sm font-bold text-[#0A0A0A] mb-2">
                شعاع جست‌وجو: <span className="text-[#CA8A04]">{formatDistance(radiusMeters)}</span>
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {RADIUS_OPTIONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRadiusMeters(r)}
                    className={`py-2 px-2 rounded-xl text-xs font-bold border transition-colors ${
                      radiusMeters === r
                        ? 'bg-[#FACC15] border-[#0A0A0A] text-[#0A0A0A]'
                        : 'bg-neutral-50 border-neutral-200 text-neutral-700 hover:border-neutral-400'
                    }`}
                  >
                    {formatDistance(r)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Date & Time Window */}
          <div className="bg-white rounded-2xl border border-neutral-200 p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm sm:text-base font-extrabold text-[#0A0A0A] flex items-center gap-2">
                <Calendar className="w-5 h-5 text-[#CA8A04]" />
                <span>تاریخ و بازه زمانی تقریبی</span>
              </h2>
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-neutral-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useTimeFilter}
                  onChange={(e) => setUseTimeFilter(e.target.checked)}
                  className="accent-[#0A0A0A]"
                />
                <span>اعمال فیلتر زمانی</span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-neutral-600 mb-1.5">تاریخ تقریبی</label>
                <select
                  value={lostDate}
                  onChange={(e) => {
                    setLostDate(e.target.value);
                    setUseTimeFilter(true);
                  }}
                  className="w-full bg-neutral-50 border border-neutral-300 focus:border-[#0A0A0A] rounded-xl px-3.5 py-2.5 text-sm outline-none"
                >
                  {dateOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-neutral-600 mb-1.5">بازه زمانی</label>
                <select
                  value={timeSlot}
                  onChange={(e) => {
                    setTimeSlot(e.target.value as typeof timeSlot);
                    setUseTimeFilter(true);
                  }}
                  className="w-full bg-neutral-50 border border-neutral-300 focus:border-[#0A0A0A] rounded-xl px-3.5 py-2.5 text-sm outline-none"
                >
                  {TIME_SLOTS.map((slot) => (
                    <option key={slot.id} value={slot.id}>
                      {slot.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setStep(2)}
            className="w-full bg-[#FACC15] hover:bg-[#EAB308] text-[#0A0A0A] font-black text-base py-4 rounded-2xl shadow-md transition-colors flex items-center justify-center gap-2"
          >
            <Search className="w-5 h-5" />
            <span>ادامه و جست‌وجوی اشیای پیدا شده</span>
          </button>
        </div>
      )}

      {/* STEP 2: SEARCH ITEMS + CREATE ALERT */}
      {step === 2 && (
        <div className="space-y-4">
          {/* Active Location & Time Summary Bar */}
          <div className="bg-[#0A0A0A] text-white rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="inline-flex items-center gap-1 font-bold text-[#FACC15]">
                <MapPin className="w-3.5 h-3.5" />
                {areaName} (شعاع {formatDistance(radiusMeters)})
              </span>
              {useTimeFilter && (
                <span className="inline-flex items-center gap-1 text-neutral-300">
                  <Clock className="w-3.5 h-3.5" />
                  {getTimeSlotLabel(timeSlot)}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="text-xs font-bold text-[#FACC15] hover:underline inline-flex items-center gap-1"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              تغییر محدوده و زمان
            </button>
          </div>

          {/* Search Input & Category Filters */}
          <div className="bg-white rounded-2xl border border-neutral-200 p-4 space-y-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void runSearch();
              }}
              className="flex gap-2"
            >
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-neutral-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="عنوان شیء گمشده (مثلاً: کیف چرم، گوشی، کلید...)"
                  className="w-full bg-neutral-50 border border-neutral-300 focus:border-[#0A0A0A] focus:bg-white rounded-xl pr-10 pl-3.5 py-2.5 text-sm outline-none"
                />
              </div>
              <button
                type="submit"
                className="bg-[#0A0A0A] hover:bg-neutral-800 text-[#FACC15] font-bold text-sm px-5 py-2.5 rounded-xl shrink-0"
              >
                جست‌وجو
              </button>
            </form>

            {/* 8 Exact Categories */}
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setCategory('')}
                className={`text-xs px-3 py-1.5 rounded-xl border font-bold transition-colors ${
                  category === ''
                    ? 'bg-[#0A0A0A] text-[#FACC15] border-[#0A0A0A]'
                    : 'bg-neutral-50 text-neutral-700 border-neutral-200 hover:border-neutral-400'
                }`}
              >
                همه دسته‌ها
              </button>
              {meta.categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategory(cat.id)}
                  className={`text-xs px-3 py-1.5 rounded-xl border font-semibold transition-colors ${
                    category === cat.id
                      ? 'bg-[#FACC15] text-[#0A0A0A] border-[#0A0A0A] font-bold'
                      : 'bg-neutral-50 text-neutral-700 border-neutral-200 hover:border-neutral-400'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Quick radius expansion toggle */}
            <div className="flex items-center justify-between text-xs pt-1 text-neutral-500">
              <span>
                {loading
                  ? 'در حال جست‌وجو...'
                  : `${toPersianDigits(items.length)} مورد فعال در این محدوده یافت شد`}
              </span>
              {radiusMeters < 10000 && (
                <button
                  type="button"
                  onClick={() => setRadiusMeters(10000)}
                  className="text-[#0A0A0A] font-bold underline"
                >
                  گسترش شعاع به ۱۰ کیلومتر
                </button>
              )}
            </div>
          </div>

          {/* Search Results */}
          {error ? (
            <ErrorState message={error} onRetry={runSearch} />
          ) : loading ? (
            <LoadingSkeleton rows={3} />
          ) : items.length === 0 ? (
            <EmptyState
              icon={<Search className="w-7 h-7" />}
              title="مورد مشابهی در این محدوده یافت نشد"
              description="نگران نباشید! می‌توانید هشدار گم‌شدن (با اعتبار ۵ روزه) ثبت کنید تا به محض ثبت شیء مشابه در این محدوده تهران، بلافاصله به شما اطلاع داده شود."
              action={
                <button
                  type="button"
                  onClick={handleOpenAlertBox}
                  className="bg-[#FACC15] hover:bg-[#EAB308] text-[#0A0A0A] font-extrabold text-sm px-6 py-3 rounded-xl inline-flex items-center gap-2 transition-colors"
                >
                  <BellRing className="w-4 h-4" />
                  <span>ثبت هشدار گم‌شدن (۵ روزه)</span>
                </button>
              }
            />
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <ItemCard key={item.id} item={item} />
              ))}
            </div>
          )}

          {/* Always-available Alert CTA Banner */}
          {!alertOpen ? (
            <div className="bg-[#FEFCE8] border-2 border-[#FACC15] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#0A0A0A] text-[#FACC15] flex items-center justify-center shrink-0">
                  <BellRing className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-[#0A0A0A]">
                    شیء خود را در میان نتایج پیدا نکردید؟
                  </h3>
                  <p className="text-xs text-neutral-700 mt-0.5 leading-5">
                    هشدار ۵ روزه ثبت کنید تا به‌محض ثبت مورد مشابه در محدوده {areaName} مطلع شوید.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleOpenAlertBox}
                className="bg-[#0A0A0A] hover:bg-neutral-800 text-[#FACC15] font-bold text-xs sm:text-sm px-4 py-2.5 rounded-xl shrink-0"
              >
                ثبت هشدار گم‌شدن
              </button>
            </div>
          ) : (
            <form
              onSubmit={handleCreateAlert}
              className="bg-white border-2 border-[#0A0A0A] rounded-2xl p-5 space-y-4 shadow-md"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-base font-extrabold text-[#0A0A0A] flex items-center gap-2">
                  <BellRing className="w-5 h-5 text-[#CA8A04]" />
                  <span>ثبت هشدار گم‌شدن (اعتبار ۵ روزه)</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setAlertOpen(false)}
                  className="text-xs text-neutral-500 hover:text-[#0A0A0A]"
                >
                  بستن
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1">
                    عنوان شیء گمشده *
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={100}
                    value={alertTitle}
                    onChange={(e) => setAlertTitle(e.target.value)}
                    placeholder="مثلاً: کیف دوشی مشکی"
                    className="w-full bg-neutral-50 border border-neutral-300 focus:border-[#0A0A0A] rounded-xl px-3.5 py-2.5 text-sm outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1">
                    دسته‌بندی *
                  </label>
                  <select
                    value={alertCategory}
                    onChange={(e) => setAlertCategory(e.target.value as ItemCategory)}
                    className="w-full bg-neutral-50 border border-neutral-300 focus:border-[#0A0A0A] rounded-xl px-3.5 py-2.5 text-sm outline-none"
                  >
                    {meta.categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="text-xs text-neutral-600 bg-neutral-50 rounded-xl p-3 flex flex-wrap gap-3">
                <span>محدوده: <strong>{areaName}</strong></span>
                <span>شعاع: <strong>{formatDistance(radiusMeters)}</strong></span>
                <span>مدت اعتبار: <strong>۵ روز</strong></span>
              </div>

              <button
                type="submit"
                disabled={alertSubmitting}
                className="w-full bg-[#FACC15] hover:bg-[#EAB308] text-[#0A0A0A] font-extrabold text-sm py-3 rounded-xl inline-flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{alertSubmitting ? 'در حال ثبت هشدار...' : 'تأیید و فعال‌سازی هشدار'}</span>
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
};
