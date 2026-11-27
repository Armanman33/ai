import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Inbox,
  CheckCircle2,
  XCircle,
  MessageSquare,
  ShieldCheck,
  Clock,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { usePageSeo } from '../lib/seo';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { IncomingClaim, MyClaim } from '../types';
import { EmptyState, ErrorState, LoadingSkeleton, PageHeader } from '../components/StateViews';
import {
  DELIVERY_STATUS_LABELS,
  formatJalaliDateTime,
  toPersianDigits,
} from '../lib/persian';

export const RequestsPage: React.FC = () => {
  const { user, loading: authLoading, refreshMe } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  usePageSeo({
    title: 'درخواست‌های دریافتی و ارسالی | چی‌کجا',
    description: 'مدیریت درخواست‌های بررسی مالکیت و هماهنگی تحویل در حساب کاربری چی‌کجا.',
    canonicalPath: '/requests',
    robots: 'noindex, nofollow, noarchive',
  });

  const [tab, setTab] = useState<'incoming' | 'mine'>('incoming');
  const [incoming, setIncoming] = useState<IncomingClaim[]>([]);
  const [mine, setMine] = useState<MyClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [incData, mineData] = await Promise.all([
        apiFetch<{ requests: IncomingClaim[] }>('/api/claims/incoming'),
        apiFetch<{ requests: MyClaim[] }>('/api/claims/mine'),
      ]);
      setIncoming(incData.requests);
      setMine(mineData.requests);
      if (incData.requests.length === 0 && mineData.requests.length > 0) {
        setTab('mine');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در دریافت درخواست‌ها');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth', { state: { from: '/requests' }, replace: true });
      return;
    }
    if (user) void load();
  }, [authLoading, user, navigate, load]);

  const handleDecision = async (claimId: string, decision: 'approve' | 'reject') => {
    setBusyId(claimId);
    try {
      await apiFetch(`/api/claims/${claimId}/finder-decision`, {
        method: 'POST',
        body: JSON.stringify({
          decision,
          note:
            decision === 'approve'
              ? 'پاسخ‌های متقاضی بررسی و مالکیت تأیید شد.'
              : 'پاسخ‌های ارسال‌شده با مشخصات شیء همخوانی نداشت.',
        }),
      });
      showToast(
        decision === 'approve'
          ? 'مالکیت متقاضی تأیید شد و گفت‌وگوی داخلی فعال گردید.'
          : 'پاسخ شما برای متقاضی ارسال شد.',
        'success'
      );
      await Promise.all([load(), refreshMe()]);
      if (decision === 'approve') {
        navigate(`/claims/${claimId}`);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'خطا در ثبت تصمیم', 'error');
    } finally {
      setBusyId(null);
    }
  };

  if (authLoading || loading) return <LoadingSkeleton rows={3} />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="درخواست‌ها و پرونده‌های تحویل"
        subtitle="مدیریت درخواست‌های دریافتی روی آگهی‌های شما و درخواست‌های ارسالی شما"
        backTo="/"
      />

      {/* Tabs */}
      <div className="grid grid-cols-2 gap-2 bg-white p-1.5 rounded-2xl border border-neutral-200">
        <button
          type="button"
          onClick={() => setTab('incoming')}
          className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-extrabold transition-colors flex items-center justify-center gap-2 ${
            tab === 'incoming'
              ? 'bg-[#0A0A0A] text-[#FACC15]'
              : 'text-neutral-600 hover:bg-neutral-50'
          }`}
        >
          <span>درخواست‌های دریافتی</span>
          <span className="bg-white/15 px-2 py-0.5 rounded-full text-[11px]">
            {toPersianDigits(incoming.length)}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setTab('mine')}
          className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-extrabold transition-colors flex items-center justify-center gap-2 ${
            tab === 'mine'
              ? 'bg-[#0A0A0A] text-[#FACC15]'
              : 'text-neutral-600 hover:bg-neutral-50'
          }`}
        >
          <span>درخواست‌های من</span>
          <span className="bg-white/15 px-2 py-0.5 rounded-full text-[11px]">
            {toPersianDigits(mine.length)}
          </span>
        </button>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : tab === 'incoming' ? (
        incoming.length === 0 ? (
          <EmptyState
            icon={<Inbox className="w-7 h-7" />}
            title="هنوز درخواستی روی آگهی‌های شما ثبت نشده است"
            description="هنگامی که کاربری به ۳ پرسش محرمانه آگهی شما پاسخ دهد، پیامک و اعلان دریافت می‌کنید و درخواست او اینجا نمایش داده می‌شود."
          />
        ) : (
          <div className="space-y-4">
            {incoming.map((req) => (
              <div
                key={req.id}
                className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-sm"
              >
                <div className="p-4 flex gap-3.5 border-b border-neutral-100">
                  <img
                    src={req.itemImageUrl}
                    alt={req.itemTitle}
                    className="w-18 h-18 rounded-xl object-cover shrink-0 border border-neutral-200"
                  />
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span
                        className={`text-[11px] font-bold px-2.5 py-0.5 rounded-lg inline-flex items-center gap-1 ${
                          req.status === 'verified'
                            ? 'bg-emerald-100 text-emerald-900'
                            : 'bg-amber-100 text-amber-900'
                        }`}
                      >
                        {req.status === 'verified' ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            مالکیت تأییدشده
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3.5 h-3.5" />
                            عدم تطابق خودکار (تلاش {toPersianDigits(req.attemptNumber)})
                          </>
                        )}
                      </span>
                      <span className="text-[11px] text-neutral-500 inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatJalaliDateTime(req.createdAt)}
                      </span>
                    </div>

                    <h3 className="text-sm sm:text-base font-extrabold text-[#0A0A0A] truncate">
                      {req.itemTitle}
                    </h3>
                    <p className="text-xs text-neutral-600">
                      متقاضی: <strong>{req.claimantName}</strong> (شماره تماس مخفی است)
                    </p>
                    {req.deliveryStatus && (
                      <p className="text-xs font-semibold text-neutral-700">
                        وضعیت تحویل: {DELIVERY_STATUS_LABELS[req.deliveryStatus] || req.deliveryStatus}
                      </p>
                    )}
                  </div>
                </div>

                {/* Comparison of 3 Q&As for finder */}
                <div className="p-4 bg-neutral-50 space-y-2.5">
                  <div className="text-xs font-bold text-neutral-700">
                    مقایسه پاسخ‌های متقاضی با پاسخ محرمانه شما:
                  </div>
                  {req.qaComparison.map((qa) => (
                    <div
                      key={qa.index}
                      className="bg-white rounded-xl border border-neutral-200 p-3 text-xs space-y-1"
                    >
                      <div className="font-bold text-[#0A0A0A]">
                        {toPersianDigits(qa.index)}. {qa.question}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 pt-0.5">
                        <span className="text-neutral-600">
                          پاسخ متقاضی: <strong className="text-[#0A0A0A]">{qa.submittedAnswer}</strong>
                        </span>
                        <span className="text-neutral-500">
                          پاسخ ثبت‌شده شما: <strong className="text-emerald-800">{qa.expectedAnswer}</strong>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Action Footer */}
                <div className="p-4 flex flex-wrap items-center justify-end gap-2 bg-white border-t border-neutral-100">
                  {req.status === 'verified' ? (
                    <Link
                      to={`/claims/${req.id}`}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-[#FACC15] hover:bg-[#EAB308] text-[#0A0A0A] font-extrabold text-xs sm:text-sm px-5 py-2.5 rounded-xl"
                    >
                      <MessageSquare className="w-4 h-4" />
                      <span>ورود به گفت‌وگوی داخلی و هماهنگی تحویل</span>
                      {req.unreadMessages > 0 && (
                        <span className="bg-red-600 text-white text-[11px] px-2 py-0.5 rounded-full">
                          {toPersianDigits(req.unreadMessages)}
                        </span>
                      )}
                    </Link>
                  ) : (
                    req.itemStatus === 'active' && (
                      <>
                        <button
                          type="button"
                          disabled={busyId === req.id}
                          onClick={() => handleDecision(req.id, 'approve')}
                          className="inline-flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs px-4 py-2.5 rounded-xl disabled:opacity-60"
                        >
                          <ShieldCheck className="w-4 h-4" />
                          <span>پاسخ‌ها درست است (تأیید دستی مالکیت)</span>
                        </button>
                        <button
                          type="button"
                          disabled={busyId === req.id}
                          onClick={() => handleDecision(req.id, 'reject')}
                          className="inline-flex items-center gap-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold text-xs px-4 py-2.5 rounded-xl disabled:opacity-60"
                        >
                          <span>ارسال پاسخ رد</span>
                        </button>
                      </>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      ) : mine.length === 0 ? (
        <EmptyState
          icon={<MessageSquare className="w-7 h-7" />}
          title="هنوز درخواست مالکیتی ثبت نکرده‌اید"
          description="پس از یافتن شیء مشابه در بخش «گم کرده‌ام» و پاسخ به ۳ پرسش محرمانه، وضعیت پرونده‌های شما اینجا نمایش داده می‌شود."
          action={
            <Link
              to="/lost"
              className="bg-[#FACC15] hover:bg-[#EAB308] text-[#0A0A0A] font-extrabold text-sm px-5 py-2.5 rounded-xl"
            >
              جست‌وجوی اشیای گمشده
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {mine.map((req) => (
            <div
              key={req.id}
              className="bg-white rounded-2xl border border-neutral-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <img
                  src={req.itemImageUrl}
                  alt={req.itemTitle}
                  className="w-16 h-16 rounded-xl object-cover shrink-0 border border-neutral-200"
                />
                <div className="min-w-0 space-y-1">
                  <span
                    className={`inline-block text-[11px] font-bold px-2.5 py-0.5 rounded-lg ${
                      req.status === 'verified'
                        ? 'bg-emerald-100 text-emerald-900'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {req.status === 'verified'
                      ? 'مالکیت تأییدشده'
                      : `عدم تطابق (تلاش ${toPersianDigits(req.attemptNumber)})`}
                  </span>
                  <h3 className="text-sm font-extrabold text-[#0A0A0A] truncate">
                    {req.itemTitle}
                  </h3>
                  <p className="text-xs text-neutral-500">
                    {req.itemArea} · {formatJalaliDateTime(req.createdAt)}
                  </p>
                  {req.deliveryStatus && (
                    <p className="text-xs font-semibold text-neutral-700">
                      {DELIVERY_STATUS_LABELS[req.deliveryStatus] || req.deliveryStatus}
                    </p>
                  )}
                </div>
              </div>

              {req.status === 'verified' ? (
                <Link
                  to={`/claims/${req.id}`}
                  className="inline-flex items-center justify-center gap-2 bg-[#FACC15] hover:bg-[#EAB308] text-[#0A0A0A] font-extrabold text-xs sm:text-sm px-4 py-2.5 rounded-xl shrink-0"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>گفت‌وگو و تحویل</span>
                  {req.unreadMessages > 0 && (
                    <span className="bg-red-600 text-white text-[11px] px-2 py-0.5 rounded-full">
                      {toPersianDigits(req.unreadMessages)}
                    </span>
                  )}
                </Link>
              ) : (
                <Link
                  to={`/items/${req.itemId}`}
                  className="inline-flex items-center justify-center bg-neutral-100 hover:bg-neutral-200 text-[#0A0A0A] font-bold text-xs px-4 py-2.5 rounded-xl shrink-0"
                >
                  مشاهده آگهی
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
