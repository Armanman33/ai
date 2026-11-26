import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  MapPin,
  Clock,
  ShieldAlert,
  Lock,
  CheckCircle2,
  EyeOff,
  Flag,
  Ban,
  MessageSquare,
  Truck,
  Building2,
  AlertTriangle,
} from 'lucide-react';
import { apiFetch, ApiError } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ItemDetail } from '../types';
import { ErrorState, LoadingSkeleton, PageHeader } from '../components/StateViews';
import { ReportModal } from '../components/ReportModal';
import { formatJalaliDateTime, formatRemainingTime, toPersianDigits } from '../lib/persian';

export const ItemDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user, meta, refreshMe } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [item, setItem] = useState<ItemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [answers, setAnswers] = useState<[string, string, string]>(['', '', '']);
  const [submitting, setSubmitting] = useState(false);
  const [attemptFeedback, setAttemptFeedback] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);

  const loadItem = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ item: ItemDetail }>(`/api/items/${id}`);
      setItem(data.item);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در دریافت اطلاعات آگهی');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadItem();
  }, [loadItem]);

  const handleSubmitAnswers = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!item) return;

    if (!user) {
      showToast('برای پاسخ به پرسش‌های محرمانه ابتدا وارد حساب کاربری شوید.', 'info');
      navigate('/auth', { state: { from: `/items/${item.id}` } });
      return;
    }

    if (answers.some((a) => !a.trim())) {
      showToast('پاسخ به هر سه پرسش برای تأیید مالکیت الزامی است.', 'error');
      return;
    }

    setSubmitting(true);
    setAttemptFeedback(null);
    try {
      const res = await apiFetch<{
        verified: boolean;
        claimId?: string;
        remainingAttempts?: number;
        permanentlyBlocked?: boolean;
        message?: string;
      }>('/api/claims', {
        method: 'POST',
        body: JSON.stringify({
          itemId: item.id,
          answers: answers.map((a) => a.trim()),
        }),
      });

      await refreshMe();

      if (res.verified && res.claimId) {
        showToast('مالکیت شما با موفقیت تأیید شد!', 'success');
        navigate(`/claims/${res.claimId}`);
        return;
      }

      setAttemptFeedback(res.message || 'پاسخ‌ها مطابقت نداشت.');
      setAnswers(['', '', '']);
      await loadItem();
    } catch (err) {
      if (err instanceof ApiError && err.data?.permanentlyBlocked) {
        setAttemptFeedback(err.message);
        await loadItem();
      } else {
        showToast(err instanceof Error ? err.message : 'خطا در بررسی پاسخ‌ها', 'error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleBlockFinder = async () => {
    if (!item || !user) return;
    if (!window.confirm('آیا از مسدودسازی این کاربر اطمینان دارید؟ پس از مسدودسازی، آگهی‌ها و ارتباط با او برای شما مخفی می‌شود.')) {
      return;
    }
    try {
      const res = await apiFetch<{ message: string }>('/api/safety/block', {
        method: 'POST',
        body: JSON.stringify({ itemId: item.id, reason: 'مسدودسازی از صفحه آگهی' }),
      });
      showToast(res.message, 'success');
      navigate('/lost');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'خطا در مسدودسازی', 'error');
    }
  };

  if (loading) return <LoadingSkeleton rows={3} />;
  if (error || !item) {
    return (
      <div className="space-y-4">
        <PageHeader title="جزئیات آگهی" backTo="/lost" />
        <ErrorState message={error || 'آگهی یافت نشد.'} onRetry={loadItem} />
      </div>
    );
  }

  const remainingTime = formatRemainingTime(item.expiresAt);
  const warningText =
    meta?.rules.ownershipWarningText ||
    'با ۳ بار اشتباه پاسخ دادن، دسترسی شما به این آگهی برای همیشه بسته می‌شود.';

  return (
    <div className="space-y-5">
      <PageHeader
        title="بررسی و اثبات مالکیت"
        subtitle={item.areaName}
        action={
          !item.isMine && user ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setReportOpen(true)}
                className="p-2.5 rounded-xl bg-white border border-neutral-200 hover:border-red-500 text-neutral-600 hover:text-red-600 transition-colors"
                title="گزارش آگهی مشکوک"
                aria-label="گزارش آگهی مشکوک"
              >
                <Flag className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleBlockFinder}
                className="p-2.5 rounded-xl bg-white border border-neutral-200 hover:border-red-500 text-neutral-600 hover:text-red-600 transition-colors"
                title="مسدودسازی کاربر"
                aria-label="مسدودسازی کاربر"
              >
                <Ban className="w-4 h-4" />
              </button>
            </div>
          ) : undefined
        }
      />

      {/* Item Summary Card */}
      <div className="bg-white rounded-3xl border border-neutral-200 overflow-hidden shadow-sm">
        <div className="relative aspect-[16/10] sm:aspect-[21/9] bg-neutral-100">
          <img
            src={item.imageUrl}
            alt={item.title}
            className="w-full h-full object-cover"
          />
          {item.imageIsBlurred && (
            <div className="absolute inset-x-4 bottom-4 bg-[#0A0A0A]/85 backdrop-blur-sm text-white rounded-2xl px-4 py-2.5 flex items-center gap-2.5 text-xs">
              <EyeOff className="w-4 h-4 text-[#FACC15] shrink-0" />
              <span>
                برای حفظ امنیت و جلوگیری از سوءاستفاده، تصویر کامل و جزئیات حساس فقط پس از تأیید مالکیت نمایش داده می‌شود.
              </span>
            </div>
          )}
        </div>

        <div className="p-5 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold bg-[#FEF9C3] text-[#0A0A0A] border border-[#FDE047] px-3 py-1 rounded-lg">
              {item.categoryLabel}
            </span>
            <span className="text-xs font-semibold bg-neutral-100 text-neutral-800 px-3 py-1 rounded-lg inline-flex items-center gap-1.5">
              {item.deliveryMethod === 'safe_point' ? (
                <>
                  <Building2 className="w-3.5 h-3.5" />
                  تحویل در نقطه امن
                </>
              ) : (
                <>
                  <Truck className="w-3.5 h-3.5" />
                  ارسال با پیک
                </>
              )}
            </span>
            {item.isSensitive && (
              <span className="text-xs font-bold bg-red-100 text-red-700 px-3 py-1 rounded-lg">
                شیء حساس (فقط نقطه امن)
              </span>
            )}
          </div>

          <h2 className="text-lg sm:text-xl font-black text-[#0A0A0A] leading-8">{item.title}</h2>

          <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs sm:text-sm text-neutral-600 pt-1">
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-[#CA8A04]" />
              محدوده {item.areaName} (تهران)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-neutral-400" />
              پیدا شده در {formatJalaliDateTime(item.foundAt)}
            </span>
          </div>

          {item.status === 'active' && (
            <div className="text-xs text-neutral-500 pt-2 border-t border-neutral-100">
              اعتبار آگهی: <strong>{remainingTime.label}</strong>
            </div>
          )}
        </div>
      </div>

      {/* STATE 1: OWN AD */}
      {item.isMine && (
        <div className="bg-[#FEFCE8] border-2 border-[#0A0A0A] rounded-2xl p-5 space-y-3">
          <h3 className="text-base font-extrabold text-[#0A0A0A]">این آگهی توسط شما ثبت شده است</h3>
          <p className="text-xs sm:text-sm text-neutral-700 leading-6">
            پاسخ ۳ پرسش محرمانه شما به‌صورت امن نزد سرور ذخیره شده است. درخواست‌های ارسالی گم‌کنندگان را در بخش «درخواست‌های دریافتی» مشاهده کنید.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/requests"
              className="bg-[#0A0A0A] text-[#FACC15] font-bold text-sm px-4 py-2.5 rounded-xl"
            >
              مشاهده درخواست‌های دریافتی
            </Link>
            <Link
              to="/my-ads"
              className="bg-white border border-neutral-300 text-[#0A0A0A] font-bold text-sm px-4 py-2.5 rounded-xl"
            >
              مدیریت آگهی‌های من
            </Link>
          </div>
        </div>
      )}

      {/* STATE 2: ALREADY VERIFIED OWNER */}
      {!item.isMine && item.verifiedClaimId && (
        <div className="bg-emerald-50 border-2 border-emerald-600 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-emerald-900 font-extrabold text-base">
            <CheckCircle2 className="w-6 h-6 text-emerald-600" />
            <span>مالکیت شما برای این شیء تأیید شده است</span>
          </div>
          <p className="text-xs sm:text-sm text-emerald-900 leading-6">
            اکنون می‌توانید از طریق گفت‌وگوی داخلی امن با یابنده هماهنگ کرده و تحویل را با کد یک‌بارمصرف پیگیری کنید.
          </p>
          <Link
            to={`/claims/${item.verifiedClaimId}`}
            className="inline-flex items-center gap-2 bg-[#0A0A0A] hover:bg-neutral-800 text-[#FACC15] font-extrabold text-sm px-5 py-3 rounded-xl"
          >
            <MessageSquare className="w-4 h-4" />
            <span>ورود به گفت‌وگوی داخلی و تحویل</span>
          </Link>
        </div>
      )}

      {/* STATE 3: PERMANENTLY BLOCKED (3 WRONG ATTEMPTS) */}
      {!item.isMine && !item.verifiedClaimId && item.permanentlyBlocked && (
        <div className="bg-red-50 border-2 border-red-600 rounded-2xl p-6 text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-red-600 text-white flex items-center justify-center mx-auto">
            <Lock className="w-7 h-7" />
          </div>
          <h3 className="text-base sm:text-lg font-black text-red-900">
            دسترسی شما به این آگهی برای همیشه بسته شده است
          </h3>
          <p className="text-xs sm:text-sm text-red-800 leading-7 max-w-md mx-auto">
            به دلیل ۳ بار پاسخ اشتباه به پرسش‌های محرمانه، امکان بررسی مالکیت روی این آگهی برای حساب شما مسدود شده است. همچنان می‌توانید از سایر آگهی‌های پیداش استفاده کنید.
          </p>
          <Link
            to="/lost"
            className="inline-flex items-center gap-2 bg-[#0A0A0A] text-[#FACC15] font-bold text-sm px-5 py-3 rounded-xl mt-2"
          >
            جست‌وجو در سایر آگهی‌های تهران
          </Link>
        </div>
      )}

      {/* STATE 4: ITEM NOT ACTIVE */}
      {!item.isMine && !item.verifiedClaimId && !item.permanentlyBlocked && item.status !== 'active' && (
        <div className="bg-neutral-100 border border-neutral-300 rounded-2xl p-5 text-center space-y-2">
          <h3 className="text-base font-bold text-[#0A0A0A]">این آگهی در حال حاضر فعال نیست</h3>
          <p className="text-xs sm:text-sm text-neutral-600">
            ممکن است مهلت ۳ روزه آگهی به پایان رسیده باشد یا مالک آن قبلاً تأیید شده باشد.
          </p>
        </div>
      )}

      {/* STATE 5: 3 SECRET QUESTIONS OWNERSHIP VERIFICATION */}
      {!item.isMine && !item.verifiedClaimId && !item.permanentlyBlocked && item.status === 'active' && (
        <form
          onSubmit={handleSubmitAnswers}
          className="bg-white rounded-3xl border border-neutral-200 p-5 sm:p-6 space-y-5 shadow-sm"
        >
          <div className="space-y-1">
            <h3 className="text-base sm:text-lg font-black text-[#0A0A0A]">
              مرحله تأیید مالکیت (پاسخ به ۳ پرسش محرمانه)
            </h3>
            <p className="text-xs sm:text-sm text-neutral-600">
              پاسخ به هر سه پرسش الزامی است. پاسخ‌ها صرفاً جهت تطبیق مالکیت واقعی بررسی می‌شوند.
            </p>
          </div>

          {/* MANDATORY EXACT WARNING BANNER (Section 5 Step 3) */}
          <div
            role="alert"
            className="bg-red-50 border-2 border-red-500 rounded-2xl p-4 flex items-start gap-3"
          >
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-xs sm:text-sm font-extrabold text-red-900 leading-6">
                {warningText}
              </p>
              <p className="text-xs font-semibold text-red-700">
                فرصت باقی‌مانده شما برای این آگهی:{' '}
                <strong className="bg-red-600 text-white px-2 py-0.5 rounded-md">
                  {toPersianDigits(item.remainingAttempts)} از ۳
                </strong>
              </p>
            </div>
          </div>

          {attemptFeedback && (
            <div className="bg-amber-50 border border-amber-400 text-amber-950 rounded-xl px-4 py-3 text-xs sm:text-sm font-bold flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0" />
              <span>{attemptFeedback}</span>
            </div>
          )}

          {/* 3 Questions */}
          <div className="space-y-4">
            {item.questions.map((q, idx) => (
              <div key={q.index} className="space-y-1.5">
                <label className="block text-sm font-bold text-[#0A0A0A]">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-[#FACC15] text-[#0A0A0A] text-xs font-black ml-2">
                    {toPersianDigits(q.index)}
                  </span>
                  {q.text}
                </label>
                <input
                  type="text"
                  required
                  maxLength={200}
                  value={answers[idx]}
                  onChange={(e) => {
                    const next: [string, string, string] = [...answers] as [string, string, string];
                    next[idx] = e.target.value;
                    setAnswers(next);
                  }}
                  placeholder="پاسخ دقیق خود را بنویسید..."
                  className="w-full bg-neutral-50 border border-neutral-300 focus:border-[#0A0A0A] focus:bg-white rounded-xl px-4 py-3 text-sm outline-none transition-colors"
                />
              </div>
            ))}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-[#FACC15] hover:bg-[#EAB308] text-[#0A0A0A] font-black text-base py-4 rounded-2xl shadow-md transition-colors disabled:opacity-60"
          >
            {submitting
              ? 'در حال بررسی پاسخ‌ها...'
              : user
                ? 'ارسال پاسخ‌ها و بررسی مالکیت'
                : 'ورود و ارسال پاسخ‌ها'}
          </button>
        </form>
      )}

      <ReportModal
        itemId={item.id}
        itemTitle={item.title}
        open={reportOpen}
        onClose={() => setReportOpen(false)}
      />
    </div>
  );
};
