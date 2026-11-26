import React, { useState } from 'react';
import { Bell, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export const NotificationPopup: React.FC = () => {
  const { showNotifPopup, enableNotifications, dismissNotifPopupForVisit } = useAuth();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  if (!showNotifPopup) return null;

  const handleEnable = async () => {
    setBusy(true);
    try {
      await enableNotifications();
      showToast('اعلان‌های پیداش با موفقیت فعال شد.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'خطا در فعال‌سازی اعلان‌ها', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="notif-modal-title"
    >
      <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl border border-neutral-200 animate-in fade-in">
        <div className="bg-[#0A0A0A] text-white px-6 py-5 flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-[#FACC15] text-[#0A0A0A] flex items-center justify-center shrink-0">
            <Bell className="w-6 h-6" />
          </div>
          <div>
            <h2 id="notif-modal-title" className="text-base font-extrabold">
              فعال‌سازی اعلان‌های پیداش
            </h2>
            <p className="text-xs text-neutral-300 mt-1">
              اطلاع‌رسانی سریع برای پیدا شدن شیء یا دریافت درخواست جدید
            </p>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-neutral-700 leading-7">
            با فعال‌سازی اعلان‌ها، به‌محض ثبت شیء مشابه در تهران، دریافت درخواست مالکیت، پیام جدید در گفت‌وگو یا نزدیک شدن به انقضای آگهی، بلافاصله مطلع می‌شوید.
          </p>

          <div className="bg-[#FEFCE8] border border-[#FDE047] rounded-2xl px-4 py-3 flex items-center gap-2.5 text-xs text-neutral-800">
            <ShieldCheck className="w-4 h-4 text-[#0A0A0A] shrink-0" />
            <span>شماره موبایل شما هرگز برای سایر کاربران نمایش داده نمی‌شود.</span>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
            <button
              type="button"
              disabled={busy}
              onClick={handleEnable}
              className="flex-1 bg-[#FACC15] hover:bg-[#EAB308] text-[#0A0A0A] font-bold text-sm py-3 px-4 rounded-xl transition-colors disabled:opacity-60"
            >
              {busy ? 'در حال فعال‌سازی...' : 'فعال‌سازی اعلان‌ها'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={dismissNotifPopupForVisit}
              className="sm:w-32 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-semibold text-sm py-3 px-4 rounded-xl transition-colors"
            >
              فعلاً نه
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
