import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Package,
  Clock,
  MapPin,
  RefreshCw,
  Trash2,
  PlusCircle,
  Inbox,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { usePageSeo } from '../lib/seo';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { MyFoundItem } from '../types';
import { EmptyState, ErrorState, LoadingSkeleton, PageHeader } from '../components/StateViews';
import { formatJalaliDateTime, formatRemainingTime, toPersianDigits } from '../lib/persian';

const STATUS_BADGES: Record<string, { label: string; cls: string }> = {
  active: { label: 'فعال', cls: 'bg-[#FEF9C3] text-[#0A0A0A] border border-[#FDE047]' },
  claimed: { label: 'مالکیت تأییدشده (در حال تحویل)', cls: 'bg-blue-100 text-blue-900' },
  delivered: { label: 'تحویل‌شده', cls: 'bg-emerald-100 text-emerald-900' },
  expired: { label: 'منقضی‌شده', cls: 'bg-red-100 text-red-800' },
};

export const MyAdsPage: React.FC = () => {
  const { user, loading: authLoading, refreshMe } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  usePageSeo({
    title: 'آگهی‌های ثبت‌شده من | چی‌کجا',
    description: 'مدیریت آگهی‌های اشیای پیدا‌شده در حساب کاربری چی‌کجا.',
    canonicalPath: '/my-ads',
    robots: 'noindex, nofollow, noarchive',
  });

  const [items, setItems] = useState<MyFoundItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ items: MyFoundItem[] }>('/api/items/mine');
      setItems(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در دریافت آگهی‌ها');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth', { state: { from: '/my-ads' }, replace: true });
      return;
    }
    if (user) void load();
  }, [authLoading, user, navigate, load]);

  const handleRelist = async (id: string) => {
    setBusyId(id);
    try {
      await apiFetch(`/api/items/${id}/relist`, { method: 'POST' });
      showToast('آگهی با موفقیت برای یک دوره ۳ روزه جدید ثبت مجدد شد.', 'success');
      await Promise.all([load(), refreshMe()]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'خطا در ثبت مجدد', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('آیا از حذف این آگهی اطمینان دارید؟')) return;
    setBusyId(id);
    try {
      await apiFetch(`/api/items/${id}`, { method: 'DELETE' });
      showToast('آگهی با موفقیت حذف شد.', 'success');
      await Promise.all([load(), refreshMe()]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'خطا در حذف آگهی', 'error');
    } finally {
      setBusyId(null);
    }
  };

  if (authLoading || loading) return <LoadingSkeleton rows={3} />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="آگهی‌های ثبت‌شده من"
        subtitle="هر آگهی پیدا شده تا ۳ روز فعال است و پس از انقضا قابل ثبت مجدد می‌باشد"
        backTo="/"
        action={
          <Link
            to="/found"
            className="inline-flex items-center gap-1.5 bg-[#FACC15] hover:bg-[#EAB308] text-[#0A0A0A] font-extrabold text-xs sm:text-sm px-3.5 py-2.5 rounded-xl"
          >
            <PlusCircle className="w-4 h-4" />
            <span>ثبت آگهی</span>
          </Link>
        }
      />

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Package className="w-7 h-7" />}
          title="هنوز آگهی پیدا شده‌ای ثبت نکرده‌اید"
          description="اگر در شهر تهران شیئی پیدا کرده‌اید، در کمتر از یک دقیقه آن را ثبت کنید تا به دست صاحب واقعی‌اش برسد."
          action={
            <Link
              to="/found"
              className="bg-[#FACC15] hover:bg-[#EAB308] text-[#0A0A0A] font-extrabold text-sm px-6 py-3 rounded-xl inline-flex items-center gap-2"
            >
              <PlusCircle className="w-4 h-4" />
              <span>ثبت شیء پیدا شده</span>
            </Link>
          }
        />
      ) : (
        <div className="space-y-3.5">
          {items.map((item) => {
            const badge = STATUS_BADGES[item.status] || { label: item.status, cls: 'bg-neutral-100 text-neutral-700' };
            const rem = formatRemainingTime(item.expiresAt);
            const isBusy = busyId === item.id;

            return (
              <div
                key={item.id}
                className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-sm"
              >
                <div className="p-4 flex gap-3.5">
                  <img
                    src={item.imageUrl}
                    alt={item.title}
                    className="w-24 h-24 rounded-xl object-cover border border-neutral-200 shrink-0 bg-neutral-100"
                  />
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-lg ${badge.cls}`}>
                        {badge.label}
                      </span>
                      <span className="text-[11px] text-neutral-500">{item.categoryLabel}</span>
                    </div>

                    <h3 className="text-sm sm:text-base font-extrabold text-[#0A0A0A] line-clamp-1">
                      {item.title}
                    </h3>

                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-600">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-[#CA8A04]" />
                        {item.areaName}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-neutral-400" />
                        {formatJalaliDateTime(item.createdAt)}
                      </span>
                    </div>

                    {item.status === 'active' && (
                      <div
                        className={`text-xs font-semibold inline-flex items-center gap-1 pt-0.5 ${
                          rem.nearExpiry ? 'text-amber-700' : 'text-neutral-600'
                        }`}
                      >
                        {rem.nearExpiry && <AlertTriangle className="w-3.5 h-3.5" />}
                        <span>{rem.label}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="px-4 py-3 bg-neutral-50 border-t border-neutral-100 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-neutral-600 flex items-center gap-3">
                    <span className="inline-flex items-center gap-1 font-semibold">
                      <Inbox className="w-3.5 h-3.5" />
                      {toPersianDigits(item.totalClaims)} درخواست
                    </span>
                    {item.verifiedClaims > 0 && (
                      <span className="inline-flex items-center gap-1 font-bold text-emerald-700">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        مالکیت تأییدشده
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {item.totalClaims > 0 && (
                      <Link
                        to="/requests"
                        className="text-xs font-bold bg-[#0A0A0A] text-[#FACC15] px-3 py-1.5 rounded-xl"
                      >
                        مشاهده درخواست‌ها
                      </Link>
                    )}

                    {item.status === 'expired' && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleRelist(item.id)}
                        className="inline-flex items-center gap-1.5 text-xs font-extrabold bg-[#FACC15] hover:bg-[#EAB308] text-[#0A0A0A] px-3.5 py-1.5 rounded-xl disabled:opacity-60"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isBusy ? 'animate-spin' : ''}`} />
                        <span>ثبت مجدد (۳ روز)</span>
                      </button>
                    )}

                    {(item.status === 'active' || item.status === 'expired') && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleDelete(item.id)}
                        className="p-1.5 rounded-lg text-neutral-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                        aria-label="حذف آگهی"
                        title="حذف آگهی"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
