import React, { useState } from 'react';
import { Flag, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useToast } from '../context/ToastContext';

const REPORT_REASONS = [
  { id: 'fake_ad', label: 'آگهی جعلی یا اطلاعات نادرست' },
  { id: 'extortion', label: 'درخواست پول یا رفتار مشکوک' },
  { id: 'privacy_violation', label: 'انتشار اطلاعات حساس یا مدرک بدون پوشش' },
  { id: 'unsafe_delivery', label: 'درخواست تحویل غیرامن یا خارج از قوانین' },
  { id: 'other', label: 'سایر موارد' },
] as const;

export const ReportModal: React.FC<{
  itemId: string;
  itemTitle: string;
  open: boolean;
  onClose: () => void;
}> = ({ itemId, itemTitle, open, onClose }) => {
  const { showToast } = useToast();
  const [reason, setReason] = useState<(typeof REPORT_REASONS)[number]['id']>('fake_ad');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await apiFetch<{ message: string }>('/api/safety/report', {
        method: 'POST',
        body: JSON.stringify({ itemId, reason, details }),
      });
      showToast(res.message, 'success');
      setDetails('');
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'خطا در ثبت گزارش', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl border border-neutral-200">
        <div className="bg-[#0A0A0A] text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Flag className="w-5 h-5 text-[#FACC15]" />
            <h2 className="text-base font-bold">گزارش آگهی مشکوک</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-1"
            aria-label="بستن"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <p className="text-xs text-neutral-500">آگهی: {itemTitle}</p>

          <div className="space-y-2">
            <label className="block text-sm font-bold text-[#0A0A0A]">دلیل گزارش</label>
            {REPORT_REASONS.map((r) => (
              <label
                key={r.id}
                className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer text-sm transition-colors ${
                  reason === r.id
                    ? 'border-[#0A0A0A] bg-[#FEFCE8] font-semibold'
                    : 'border-neutral-200 hover:bg-neutral-50'
                }`}
              >
                <input
                  type="radio"
                  name="report-reason"
                  value={r.id}
                  checked={reason === r.id}
                  onChange={() => setReason(r.id)}
                  className="accent-[#0A0A0A]"
                />
                <span>{r.label}</span>
              </label>
            ))}
          </div>

          <div>
            <label className="block text-sm font-bold text-[#0A0A0A] mb-1.5">
              توضیحات تکمیلی (اختیاری)
            </label>
            <textarea
              rows={3}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              maxLength={400}
              placeholder="جزئیات مورد مشکوک را بنویسید..."
              className="w-full rounded-xl border border-neutral-300 focus:border-[#0A0A0A] p-3 text-sm outline-none resize-none"
            />
          </div>

          <div className="flex gap-2.5 pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold text-sm py-3 rounded-xl transition-colors disabled:opacity-60"
            >
              {submitting ? 'در حال ثبت...' : 'ارسال گزارش'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-semibold text-sm py-3 rounded-xl"
            >
              انصراف
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
