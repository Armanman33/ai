import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  BellRing,
  MapPin,
  Clock,
  RefreshCw,
  Trash2,
  Search,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { usePageSeo } from '../lib/seo';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { LostAlertItem } from '../types';
import { EmptyState, ErrorState, LoadingSkeleton, PageHeader } from '../components/StateViews';
import {
  formatDistance,
  formatRemainingTime,
  getTimeSlotLabel,
  toPersianDigits,
} from '../lib/persian';

export const MyAlertsPage: React.FC = () => {
  const { user, loading: authLoading, refreshMe } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  usePageSeo({
    title: 'هشدارهای گم‌شدن من | چی‌کجا',
    description: 'پیگیری هشدارهای ۵ روزه اشیای گمشده در حساب کاربری چی‌کجا.',
    canonicalPath: '/my-alerts',
    robots: 'noindex, nofollow, noarchive',
  });

  const [alerts, setAlerts] = useState<LostAlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ alerts: LostAlertItem[] }>('/api/alerts/mine');
      setAlerts(data.alerts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در دریافت هشدارها');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth', { state: { from: '/my-alerts' }, replace: true });
      return;
    }
    if (user) void load();
  }, [authLoading, user, navigate, load]);

  const handleRelist = async (id: string) => {
    setBusyId(id);
    try {
      await apiFetch(`/api/alerts/${id}/relist`, { method: 'POST' });
      showToast('هشدار برای یک دوره ۵ روزه جدید فعال شد.', 'success');
      await Promise.all([load(), refreshMe()]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'خطا در تمدید هشدار', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('آیا از حذف این هشدار اطمینان دارید؟')) return;
    setBusyId(id);
    try {
      await apiFetch(`/api/alerts/${id}`, { method: 'DELETE' });
      showToast('هشدار حذف شد.', 'success');
      await Promise.all([load(), refreshMe()]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'خطا در حذف هشدار', 'error');
    } finally {
      setBusyId(null);
    }
  };

  if (authLoading || loading) return <LoadingSkeleton rows={3} />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="هشدارهای من"
        subtitle="هر هشدار گم‌شدن تا ۵ روز فعال است و در صورت ثبت مورد مشابه مطلع می‌شوید"
        backTo="/"
        action={
          <Link
            to="/lost"
            className="inline-flex items-center gap-1.5 bg-[#FACC15] hover:bg-[#EAB308] text-[#0A0A0A] font-extrabold text-xs sm:text-sm px-3.5 py-2.5 rounded-xl"
          >
            <Search className="w-4 h-4" />
            <span>جست‌وجو / هشدار جدید</span>
          </Link>
        }
      />

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : alerts.length === 0 ? (
        <EmptyState
          icon={<BellRing className="w-7 h-7" />}
          title="هیچ هشداری ثبت نکرده‌اید"
          description="اگر در بخش «گم کرده‌ام» شیء خود را پیدا نکردید، یک هشدار ۵ روزه ثبت کنید تا به‌محض پیدا شدن مورد مشابه در همان محدوده تهران مطلع شوید."
          action={
            <Link
              to="/lost"
              className="bg-[#FACC15] hover:bg-[#EAB308] text-[#0A0A0A] font-extrabold text-sm px-6 py-3 rounded-xl inline-flex items-center gap-2"
            >
              <Search className="w-4 h-4" />
              <span>رفتن به بخش گم کرده‌ام</span>
            </Link>
          }
        />
      ) : (
        <div className="space-y-4">
          {alerts.map((alert) => {
            const rem = formatRemainingTime(alert.expiresAt);
            const isBusy = busyId === alert.id;

            return (
              <div
                key={alert.id}
                className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-sm"
              >
                <div className="p-4 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span
                      className={`text-[11px] font-bold px-2.5 py-0.5 rounded-lg ${
                        alert.status === 'active'
                          ? 'bg-[#FEF9C3] text-[#0A0A0A] border border-[#FDE047]'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {alert.status === 'active' ? 'فعال' : 'منقضی‌شده'}
                    </span>
                    <span className="text-xs font-semibold text-neutral-500">
                      {alert.categoryLabel}
                    </span>
                  </div>

                  <h3 className="text-base font-extrabold text-[#0A0A0A]">{alert.title}</h3>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-600">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-[#CA8A04]" />
                      {alert.areaName} (شعاع {formatDistance(alert.radiusMeters)})
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-neutral-400" />
                      {getTimeSlotLabel(alert.timeSlot)}
                    </span>
                  </div>

                  {alert.status === 'active' && (
                    <div
                      className={`text-xs font-semibold inline-flex items-center gap-1 ${
                        rem.nearExpiry ? 'text-amber-700' : 'text-neutral-500'
                      }`}
                    >
                      {rem.nearExpiry && <AlertTriangle className="w-3.5 h-3.5" />}
                      <span>{rem.label}</span>
                    </div>
                  )}

                  {/* Matching active items preview */}
                  {alert.matchingItems.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-neutral-100 space-y-2">
                      <div className="text-xs font-extrabold text-emerald-800 flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-[#CA8A04]" />
                        <span>
                          {toPersianDigits(alert.matchingItems.length)} مورد مشابه فعال در این محدوده یافت شد:
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {alert.matchingItems.map((m) => (
                          <Link
                            key={m.id}
                            to={`/items/${m.id}`}
                            className="flex items-center gap-3 p-2 rounded-xl bg-[#FEFCE8] hover:bg-[#FEF9C3] border border-[#FDE047] transition-colors"
                          >
                            <img
                              src={m.imageUrl}
                              alt={m.title}
                              className="w-11 h-11 rounded-lg object-cover shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-bold text-[#0A0A0A] truncate">
                                {m.title}
                              </div>
                              <div className="text-[11px] text-neutral-600">{m.areaName}</div>
                            </div>
                            <span className="text-[11px] font-extrabold bg-[#0A0A0A] text-[#FACC15] px-2.5 py-1 rounded-lg shrink-0">
                              بررسی
                            </span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="px-4 py-3 bg-neutral-50 border-t border-neutral-100 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-neutral-500">
                    اعتبار هر دوره: ۵ روز
                  </span>
                  <div className="flex items-center gap-2">
                    {alert.status === 'expired' && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleRelist(alert.id)}
                        className="inline-flex items-center gap-1.5 text-xs font-extrabold bg-[#FACC15] hover:bg-[#EAB308] text-[#0A0A0A] px-3.5 py-1.5 rounded-xl disabled:opacity-60"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isBusy ? 'animate-spin' : ''}`} />
                        <span>ثبت مجدد (۵ روز)</span>
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleDelete(alert.id)}
                      className="p-1.5 rounded-lg text-neutral-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                      aria-label="حذف هشدار"
                      title="حذف هشدار"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
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
