import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  CheckCheck,
  Sparkles,
  MessageSquare,
  ShieldCheck,
  Truck,
  Clock,
  Inbox,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { usePageSeo } from '../lib/seo';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { NotificationItem } from '../types';
import { EmptyState, ErrorState, LoadingSkeleton, PageHeader } from '../components/StateViews';
import { formatJalaliDateTime } from '../lib/persian';

function getNotificationIcon(type: string) {
  switch (type) {
    case 'similar_item_found':
      return <Sparkles className="w-5 h-5 text-[#CA8A04]" />;
    case 'ownership_verified':
    case 'claimant_verified':
      return <ShieldCheck className="w-5 h-5 text-emerald-700" />;
    case 'new_message':
    case 'finder_replied':
      return <MessageSquare className="w-5 h-5 text-[#0A0A0A]" />;
    case 'courier_requested':
    case 'delivery_status_changed':
    case 'delivery_confirmed':
      return <Truck className="w-5 h-5 text-[#0A0A0A]" />;
    case 'claim_received':
      return <Inbox className="w-5 h-5 text-[#0A0A0A]" />;
    case 'item_expiring_soon':
    case 'item_expired':
    case 'alert_expiring_soon':
    case 'alert_expired':
      return <Clock className="w-5 h-5 text-amber-700" />;
    default:
      return <Bell className="w-5 h-5 text-[#0A0A0A]" />;
  }
}

export const NotificationsPage: React.FC = () => {
  const { user, loading: authLoading, refreshMe } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  usePageSeo({
    title: 'اعلان‌های حساب کاربری | چی‌کجا',
    description: 'مشاهده اعلان‌های سامانه اشیای گمشده چی‌کجا.',
    canonicalPath: '/notifications',
    robots: 'noindex, nofollow, noarchive',
  });

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ notifications: NotificationItem[] }>('/api/notifications');
      setNotifications(data.notifications);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در دریافت اعلان‌ها');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth', { state: { from: '/notifications' }, replace: true });
      return;
    }
    if (user) void load();
  }, [authLoading, user, navigate, load]);

  const handleReadAll = async () => {
    try {
      await apiFetch('/api/notifications/read-all', { method: 'POST' });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      await refreshMe();
      showToast('همه اعلان‌ها خوانده شدند.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'خطا در بروزرسانی اعلان‌ها', 'error');
    }
  };

  const handleOpenNotification = async (notif: NotificationItem) => {
    if (!notif.isRead) {
      try {
        await apiFetch(`/api/notifications/${notif.id}/read`, { method: 'POST' });
        await refreshMe();
      } catch {
        // ignore read error on navigation
      }
    }
    navigate(notif.linkPath || '/');
  };

  if (authLoading || loading) return <LoadingSkeleton rows={4} />;

  const hasUnread = notifications.some((n) => !n.isRead);

  return (
    <div className="space-y-5">
      <PageHeader
        title="اعلان‌ها"
        subtitle="اطلاع‌رسانی لحظه‌ای وضعیت آگهی‌ها، هشدارها، مالکیت و تحویل"
        backTo="/"
        action={
          hasUnread ? (
            <button
              type="button"
              onClick={handleReadAll}
              className="inline-flex items-center gap-1.5 text-xs font-bold bg-[#0A0A0A] text-[#FACC15] px-3.5 py-2 rounded-xl"
            >
              <CheckCheck className="w-4 h-4" />
              <span>خواندن همه</span>
            </button>
          ) : undefined
        }
      />

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : notifications.length === 0 ? (
        <EmptyState
          icon={<Bell className="w-7 h-7" />}
          title="هنوز اعلانی ندارید"
          description="به‌محض ثبت مورد مشابه، دریافت درخواست جدید، تأیید مالکیت یا تغییر وضعیت تحویل، اعلان آن اینجا نمایش داده می‌شود."
        />
      ) : (
        <div className="space-y-2.5">
          {notifications.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => handleOpenNotification(n)}
              className={`w-full text-right rounded-2xl border p-4 flex items-start gap-3.5 transition-all ${
                n.isRead
                  ? 'bg-white border-neutral-200 hover:border-neutral-400'
                  : 'bg-[#FEFCE8] border-[#FACC15] hover:border-[#0A0A0A] shadow-xs'
              }`}
            >
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  n.isRead ? 'bg-neutral-100' : 'bg-[#FACC15]/30'
                }`}
              >
                {getNotificationIcon(n.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-extrabold text-[#0A0A0A]">{n.title}</h3>
                  {!n.isRead && (
                    <span className="w-2.5 h-2.5 rounded-full bg-red-600 shrink-0" />
                  )}
                </div>
                <p className="text-xs text-neutral-700 mt-1 leading-6">{n.body}</p>
                <div className="text-[11px] text-neutral-500 mt-1.5">
                  {formatJalaliDateTime(n.createdAt)}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
