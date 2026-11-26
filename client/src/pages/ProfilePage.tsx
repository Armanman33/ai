import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UserCircle2,
  Bell,
  ShieldCheck,
  Ban,
  LogOut,
  CheckCircle2,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { usePageSeo } from '../lib/seo';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { BlockedUser } from '../types';
import { LoadingSkeleton, PageHeader } from '../components/StateViews';
import { formatJalaliDate, toPersianDigits } from '../lib/persian';

export const ProfilePage: React.FC = () => {
  const { user, loading: authLoading, updateProfile, enableNotifications, logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  usePageSeo({
    title: 'پروفایل و تنظیمات امنیتی | چی‌کجا',
    description: 'مدیریت حساب کاربری، اعلان‌ها و کاربران مسدودشده در سامانه چی‌کجا.',
    canonicalPath: '/profile',
    robots: 'noindex, nofollow, noarchive',
  });

  const [displayName, setDisplayName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [togglingNotif, setTogglingNotif] = useState(false);
  const [blocks, setBlocks] = useState<BlockedUser[]>([]);
  const [loadingBlocks, setLoadingBlocks] = useState(false);

  const loadBlocks = useCallback(async () => {
    if (!user) return;
    setLoadingBlocks(true);
    try {
      const data = await apiFetch<{ blocks: BlockedUser[] }>('/api/safety/blocks');
      setBlocks(data.blocks);
    } catch {
      // ignore
    } finally {
      setLoadingBlocks(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth', { state: { from: '/profile' }, replace: true });
      return;
    }
    if (user) {
      setDisplayName(user.displayName);
      void loadBlocks();
    }
  }, [authLoading, user, navigate, loadBlocks]);

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (displayName.trim().length < 2) {
      showToast('نام نمایشی باید حداقل ۲ حرف باشد.', 'error');
      return;
    }
    setSavingName(true);
    try {
      await updateProfile({ displayName: displayName.trim() });
      showToast('نام نمایشی با موفقیت بروزرسانی شد.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'خطا در ذخیره نام', 'error');
    } finally {
      setSavingName(false);
    }
  };

  const handleToggleNotifications = async () => {
    if (!user) return;
    setTogglingNotif(true);
    try {
      if (!user.notificationsEnabled) {
        await enableNotifications();
        showToast('اعلان‌ها فعال شد.', 'success');
      } else {
        await updateProfile({ notificationsEnabled: false });
        showToast('اعلان‌ها غیرفعال شد. در مراجعه بعدی مجدداً پیشنهاد فعال‌سازی نمایش داده می‌شود.', 'info');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'خطا در تغییر تنظیمات اعلان', 'error');
    } finally {
      setTogglingNotif(false);
    }
  };

  const handleUnblock = async (blockedId: string) => {
    try {
      await apiFetch(`/api/safety/blocks/${blockedId}`, { method: 'DELETE' });
      setBlocks((prev) => prev.filter((b) => b.id !== blockedId));
      showToast('مسدودیت کاربر برداشته شد.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'خطا در رفع مسدودیت', 'error');
    }
  };

  const handleLogout = async () => {
    await logout();
    showToast('با موفقیت از حساب کاربری خارج شدید.', 'info');
    navigate('/');
  };

  if (authLoading || !user) return <LoadingSkeleton rows={3} />;

  return (
    <div className="space-y-5">
      <PageHeader title="پروفایل و تنظیمات" subtitle="مدیریت حساب کاربری، اعلان‌ها و امنیت" backTo="/" />

      {/* Identity Card */}
      <div className="bg-white rounded-3xl border border-neutral-200 p-5 space-y-4 shadow-sm">
        <div className="flex items-center gap-3.5 pb-4 border-b border-neutral-100">
          <div className="w-14 h-14 rounded-2xl bg-[#0A0A0A] text-[#FACC15] flex items-center justify-center shrink-0">
            <UserCircle2 className="w-8 h-8" />
          </div>
          <div>
            <div className="text-base font-extrabold text-[#0A0A0A]">{user.displayName}</div>
            <div className="text-xs text-neutral-500 mt-0.5" dir="ltr">
              {toPersianDigits(user.phoneMasked)}
            </div>
          </div>
        </div>

        <form onSubmit={handleSaveName} className="flex flex-col sm:flex-row gap-2.5">
          <input
            type="text"
            required
            minLength={2}
            maxLength={60}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="نام نمایشی شما"
            className="flex-1 bg-neutral-50 border border-neutral-300 focus:border-[#0A0A0A] focus:bg-white rounded-xl px-4 py-2.5 text-sm outline-none"
          />
          <button
            type="submit"
            disabled={savingName}
            className="bg-[#FACC15] hover:bg-[#EAB308] text-[#0A0A0A] font-extrabold text-sm px-5 py-2.5 rounded-xl shrink-0 disabled:opacity-60"
          >
            {savingName ? 'در حال ذخیره...' : 'ذخیره نام'}
          </button>
        </form>
      </div>

      {/* Notification Settings */}
      <div className="bg-white rounded-2xl border border-neutral-200 p-5 flex items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#FEF9C3] text-[#0A0A0A] flex items-center justify-center shrink-0">
            <Bell className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-[#0A0A0A]">وضعیت اعلان‌های سامانه</h3>
            <p className="text-xs text-neutral-600 mt-0.5 leading-5">
              اطلاع‌رسانی برای موارد مشابه، پیام‌ها، درخواست مالکیت و انقضای آگهی‌ها
            </p>
          </div>
        </div>

        <button
          type="button"
          disabled={togglingNotif}
          onClick={handleToggleNotifications}
          className={`px-4 py-2 rounded-xl text-xs font-extrabold shrink-0 transition-colors ${
            user.notificationsEnabled
              ? 'bg-emerald-100 text-emerald-900 hover:bg-emerald-200'
              : 'bg-[#0A0A0A] text-[#FACC15] hover:bg-neutral-800'
          }`}
        >
          {user.notificationsEnabled ? 'فعال ✓' : 'فعال‌سازی'}
        </button>
      </div>

      {/* Privacy & Security Guarantees */}
      <div className="bg-[#0A0A0A] text-white rounded-2xl p-5 space-y-2.5">
        <div className="flex items-center gap-2 text-[#FACC15] text-sm font-extrabold">
          <ShieldCheck className="w-5 h-5" />
          <span>اصول حریم خصوصی در چی‌کجا</span>
        </div>
        <ul className="text-xs text-neutral-300 space-y-1.5 leading-6">
          <li className="flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#FACC15] shrink-0" />
            شماره موبایل شما هرگز برای سایر کاربران نمایش داده نمی‌شود.
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#FACC15] shrink-0" />
            نشانی منزل شما فقط در اختیار پیک مجاز قرار می‌گیرد.
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#FACC15] shrink-0" />
            پاسخ ۳ پرسش محرمانه و محدودیت ۳ بار اشتباه در سمت سرور کنترل می‌شود.
          </li>
        </ul>
      </div>

      {/* Blocked Users */}
      <div className="bg-white rounded-2xl border border-neutral-200 p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-extrabold text-[#0A0A0A]">
          <Ban className="w-4 h-4 text-red-600" />
          <span>کاربران مسدودشده ({toPersianDigits(blocks.length)})</span>
        </div>
        {loadingBlocks ? (
          <p className="text-xs text-neutral-500">در حال بارگذاری...</p>
        ) : blocks.length === 0 ? (
          <p className="text-xs text-neutral-500">هیچ کاربری را مسدود نکرده‌اید.</p>
        ) : (
          <div className="divide-y divide-neutral-100">
            {blocks.map((b) => (
              <div key={b.id} className="py-2.5 flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-bold text-[#0A0A0A]">{b.displayName}</div>
                  <div className="text-[11px] text-neutral-500">
                    مسدود شده در {formatJalaliDate(b.createdAt)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleUnblock(b.id)}
                  className="text-xs font-bold bg-neutral-100 hover:bg-neutral-200 text-neutral-800 px-3 py-1.5 rounded-lg"
                >
                  رفع مسدودیت
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Logout */}
      <button
        type="button"
        onClick={handleLogout}
        className="w-full bg-white hover:bg-red-50 border border-red-200 text-red-700 font-extrabold text-sm py-3.5 rounded-2xl inline-flex items-center justify-center gap-2 transition-colors"
      >
        <LogOut className="w-4 h-4" />
        <span>خروج از حساب کاربری</span>
      </button>
    </div>
  );
};
