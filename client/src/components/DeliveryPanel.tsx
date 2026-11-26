import React, { useState } from 'react';
import {
  ShieldCheck,
  Truck,
  Building2,
  KeyRound,
  Receipt,
  CheckCircle2,
  Clock,
  Lock,
  Copy,
  History,
} from 'lucide-react';
import { ClaimRoomData, SafePoint } from '../types';
import { apiFetch } from '../lib/api';
import { useToast } from '../context/ToastContext';
import {
  DELIVERY_STATUS_LABELS,
  formatJalaliDateTime,
  toPersianDigits,
} from '../lib/persian';

interface DeliveryPanelProps {
  claim: ClaimRoomData;
  safePoints: SafePoint[];
  advisoryText: string;
  onUpdated: () => Promise<void>;
}

export const DeliveryPanel: React.FC<DeliveryPanelProps> = ({
  claim,
  safePoints,
  advisoryText,
  onUpdated,
}) => {
  const { showToast } = useToast();
  const delivery = claim.delivery;
  const isFinder = claim.myRole === 'finder';
  const isLoser = claim.myRole === 'loser';

  const [selectedMethod, setSelectedMethod] = useState<'courier' | 'safe_point'>(
    claim.item.safePointOnly ? 'safe_point' : delivery?.method || 'courier'
  );
  const [destinationArea, setDestinationArea] = useState('');
  const [destinationAddress, setDestinationAddress] = useState('');
  const [acceptCourierFee, setAcceptCourierFee] = useState(false);
  const [safePointId, setSafePointId] = useState(
    delivery?.safePoint?.id || safePoints[0]?.id || ''
  );
  const [codeInput, setCodeInput] = useState('');
  const [operatorName, setOperatorName] = useState('مسئول باجه نقطه امن چی‌کجا');
  const [busy, setBusy] = useState(false);

  if (!delivery) return null;

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      showToast('کد یک‌بارمصرف کپی شد.', 'info');
    } catch {
      showToast('کد را به صورت دستی یادداشت کنید.', 'info');
    }
  };

  const handleRequestCourier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!destinationArea.trim() || destinationAddress.trim().length < 8) {
      showToast('لطفاً محله و نشانی دقیق در تهران را وارد کنید.', 'error');
      return;
    }
    if (!acceptCourierFee) {
      showToast('لطفاً پرداخت هزینه پیک توسط گم‌کننده را تأیید کنید.', 'error');
      return;
    }
    setBusy(true);
    try {
      await apiFetch(`/api/deliveries/${claim.id}/request-courier`, {
        method: 'POST',
        body: JSON.stringify({
          destinationArea: destinationArea.trim(),
          destinationAddress: destinationAddress.trim(),
          acceptCourierFee: true,
        }),
      });
      showToast('درخواست ارسال با پیک ثبت شد و کد تحویل یک‌بارمصرف صادر گردید.', 'success');
      await onUpdated();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'خطا در ثبت درخواست پیک', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleSelectSafePoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!safePointId) {
      showToast('لطفاً یک نقطه امن انتخاب کنید.', 'error');
      return;
    }
    setBusy(true);
    try {
      await apiFetch(`/api/deliveries/${claim.id}/select-safe-point`, {
        method: 'POST',
        body: JSON.stringify({ safePointId }),
      });
      showToast('نقطه امن تحویل ثبت شد و کد یک‌بارمصرف صادر گردید.', 'success');
      await onUpdated();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'خطا در انتخاب نقطه امن', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmCourierHandover = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/api/deliveries/${claim.id}/confirm-courier-handover`, {
        method: 'POST',
        body: JSON.stringify({ code: codeInput }),
      });
      setCodeInput('');
      showToast('تحویل شیء به پیک با کد امن تأیید شد.', 'success');
      await onUpdated();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'کد تحویل نادرست است', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmSafePointDropoff = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/api/deliveries/${claim.id}/confirm-safe-point-dropoff`, {
        method: 'POST',
        body: JSON.stringify({ code: codeInput, operatorName: operatorName.trim() }),
      });
      setCodeInput('');
      showToast('دریافت شیء در نقطه امن ثبت شد و رسید دیجیتال امانت صادر گردید.', 'success');
      await onUpdated();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'کد تحویل نادرست است', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmFinalDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/api/deliveries/${claim.id}/confirm-delivery`, {
        method: 'POST',
        body: JSON.stringify({ code: codeInput }),
      });
      setCodeInput('');
      showToast('دریافت نهایی تأیید و رسید دیجیتال صادر شد!', 'success');
      await onUpdated();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'کد تحویل نهایی نادرست است', 'error');
    } finally {
      setBusy(false);
    }
  };

  const canConfigureMethod =
    delivery.status === 'pending_coordination' ||
    (delivery.status === 'safe_point_selected' && !delivery.handedOverAt);

  return (
    <div className="space-y-4">
      {/* Mandatory Security Advisory Box (Section 6) */}
      <div className="bg-[#0A0A0A] text-white rounded-2xl p-4 border-2 border-[#FACC15]">
        <div className="flex items-center gap-2 text-[#FACC15] font-bold text-sm mb-2">
          <ShieldCheck className="w-5 h-5 shrink-0" />
          <span>توصیه‌های امنیتی تحویل شیء</span>
        </div>
        <p className="text-xs sm:text-sm text-neutral-200 leading-7 whitespace-pre-line">
          {advisoryText}
        </p>
      </div>

      {/* Current Delivery Status Card */}
      <div className="bg-white rounded-2xl border border-neutral-200 p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-neutral-100">
          <div>
            <span className="text-xs text-neutral-500">وضعیت فعلی تحویل</span>
            <h3 className="text-sm sm:text-base font-extrabold text-[#0A0A0A] mt-0.5">
              {DELIVERY_STATUS_LABELS[delivery.status] || delivery.status}
            </h3>
          </div>
          <span
            className={`text-xs font-bold px-3 py-1.5 rounded-xl inline-flex items-center gap-1.5 ${
              delivery.status === 'delivered'
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-[#FEF9C3] text-[#0A0A0A] border border-[#FDE047]'
            }`}
          >
            {delivery.method === 'safe_point' ? (
              <>
                <Building2 className="w-4 h-4" />
                تحویل به نقطه امن
              </>
            ) : (
              <>
                <Truck className="w-4 h-4" />
                ارسال با پیک
              </>
            )}
          </span>
        </div>

        {/* Privacy note about no in-person / no public drop */}
        <div className="bg-neutral-50 rounded-xl px-3.5 py-2.5 text-xs text-neutral-600 flex items-center gap-2">
          <Lock className="w-4 h-4 text-[#0A0A0A] shrink-0" />
          <span>
            دیدار حضوری و رها کردن شیء در مکان عمومی غیرمجاز است.{' '}
            {claim.item.safePointOnly
              ? 'برای مدارک شناسایی و کارت بانکی، تحویل فقط از طریق نقطه امن انجام می‌شود.'
              : 'تحویل فقط با پیک مجاز یا نقطه امن با کد یک‌بارمصرف انجام می‌شود.'}
          </span>
        </div>

        {/* Selected Safe Point Details */}
        {delivery.safePoint && (
          <div className="bg-[#FEFCE8] border border-[#FDE047] rounded-2xl p-4 space-y-1">
            <div className="text-xs font-bold text-neutral-700">نقطه امن انتخاب‌شده در تهران:</div>
            <div className="text-sm font-extrabold text-[#0A0A0A]">{delivery.safePoint.name}</div>
            <div className="text-xs text-neutral-700">{delivery.safePoint.address}</div>
            <div className="text-xs text-neutral-600 flex items-center gap-1 pt-1">
              <Clock className="w-3.5 h-3.5" />
              ساعات پذیرش: {delivery.safePoint.hours}
            </div>
          </div>
        )}

        {/* Courier Masked Destination */}
        {delivery.method === 'courier' && delivery.courierDestinationMasked && (
          <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4 space-y-1">
            <div className="text-xs font-bold text-neutral-500">مقصد ارسال با پیک (حفظ حریم خصوصی):</div>
            <div className="text-sm font-semibold text-[#0A0A0A]">
              {delivery.courierDestinationMasked}
            </div>
            <div className="text-xs text-neutral-600">هزینه ارسال با پیک بر عهده گم‌کننده است.</div>
          </div>
        )}

        {/* METHOD CONFIGURATION (Before handover) */}
        {canConfigureMethod && (
          <div className="space-y-4 pt-1">
            {!claim.item.safePointOnly && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedMethod('courier')}
                  className={`p-3 rounded-xl border-2 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors ${
                    selectedMethod === 'courier'
                      ? 'border-[#0A0A0A] bg-[#FACC15] text-[#0A0A0A]'
                      : 'border-neutral-200 bg-white text-neutral-600'
                  }`}
                >
                  <Truck className="w-4 h-4" />
                  ارسال با پیک
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedMethod('safe_point')}
                  className={`p-3 rounded-xl border-2 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors ${
                    selectedMethod === 'safe_point'
                      ? 'border-[#0A0A0A] bg-[#FACC15] text-[#0A0A0A]'
                      : 'border-neutral-200 bg-white text-neutral-600'
                  }`}
                >
                  <Building2 className="w-4 h-4" />
                  تحویل به نقطه امن
                </button>
              </div>
            )}

            {selectedMethod === 'courier' && !claim.item.safePointOnly && isLoser && (
              <form onSubmit={handleRequestCourier} className="space-y-3 bg-neutral-50 p-4 rounded-2xl border border-neutral-200">
                <h4 className="text-sm font-bold text-[#0A0A0A]">ثبت درخواست ارسال با پیک</h4>
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1">
                    محدوده یا محله مقصد در تهران
                  </label>
                  <input
                    type="text"
                    required
                    value={destinationArea}
                    onChange={(e) => setDestinationArea(e.target.value)}
                    placeholder="مثلاً: میدان ونک، یوسف‌آباد..."
                    className="w-full bg-white border border-neutral-300 focus:border-[#0A0A0A] rounded-xl px-3.5 py-2.5 text-sm outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1">
                    نشانی تحویل (محرمانه — فقط برای پیک مجاز)
                  </label>
                  <textarea
                    rows={2}
                    required
                    value={destinationAddress}
                    onChange={(e) => setDestinationAddress(e.target.value)}
                    placeholder="نشانی دقیق در تهران را بنویسید. این نشانی برای یابنده نمایش داده نمی‌شود."
                    className="w-full bg-white border border-neutral-300 focus:border-[#0A0A0A] rounded-xl px-3.5 py-2.5 text-sm outline-none resize-none"
                  />
                </div>
                <label className="flex items-start gap-2.5 text-xs text-neutral-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={acceptCourierFee}
                    onChange={(e) => setAcceptCourierFee(e.target.checked)}
                    className="mt-0.5 accent-[#0A0A0A]"
                  />
                  <span>می‌پذیرم که هزینه ارسال با پیک بر عهده من (گم‌کننده) است.</span>
                </label>
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full bg-[#FACC15] hover:bg-[#EAB308] text-[#0A0A0A] font-extrabold text-sm py-3 rounded-xl transition-colors disabled:opacity-60"
                >
                  {busy ? 'در حال ثبت...' : 'ثبت درخواست ارسال با پیک'}
                </button>
              </form>
            )}

            {selectedMethod === 'courier' && !claim.item.safePointOnly && isFinder && delivery.status === 'pending_coordination' && (
              <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4 text-xs sm:text-sm text-neutral-700 leading-6">
                در انتظار ثبت درخواست ارسال با پیک توسط مالک. به محض ثبت درخواست توسط مالک، کد یک‌بارمصرف تحویل به پیک برای شما فعال می‌شود.
              </div>
            )}

            {selectedMethod === 'safe_point' && (
              <form onSubmit={handleSelectSafePoint} className="space-y-3 bg-neutral-50 p-4 rounded-2xl border border-neutral-200">
                <h4 className="text-sm font-bold text-[#0A0A0A]">
                  {delivery.safePoint ? 'تغییر یا تأیید نقطه امن تهران' : 'انتخاب نقطه امن در تهران'}
                </h4>
                <select
                  value={safePointId}
                  onChange={(e) => setSafePointId(e.target.value)}
                  className="w-full bg-white border border-neutral-300 focus:border-[#0A0A0A] rounded-xl px-3.5 py-2.5 text-sm outline-none"
                >
                  {safePoints.map((sp) => (
                    <option key={sp.id} value={sp.id}>
                      {sp.name} — {sp.area}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full bg-[#0A0A0A] hover:bg-neutral-800 text-[#FACC15] font-bold text-sm py-2.5 rounded-xl transition-colors disabled:opacity-60"
                >
                  {busy ? 'در حال ثبت...' : 'تأیید نقطه امن و صدور کد تحویل'}
                </button>
              </form>
            )}
          </div>
        )}

        {/* FINDER HANDOVER STAGE (Courier or Safe Point) */}
        {isFinder && (delivery.status === 'courier_requested' || delivery.status === 'safe_point_selected') && (
          <div className="bg-[#FEFCE8] border-2 border-[#0A0A0A] rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2 font-extrabold text-sm text-[#0A0A0A]">
              <KeyRound className="w-5 h-5" />
              <span>
                {delivery.status === 'courier_requested'
                  ? 'کد یک‌بارمصرف تحویل به پیک'
                  : 'کد یک‌بارمصرف تحویل به مسئول نقطه امن'}
              </span>
            </div>

            {delivery.activeHandoverCode && (
              <div className="bg-[#0A0A0A] text-[#FACC15] rounded-xl px-4 py-3 flex items-center justify-between">
                <span className="text-2xl font-black tracking-[0.25em] font-mono">
                  {toPersianDigits(delivery.activeHandoverCode)}
                </span>
                <button
                  type="button"
                  onClick={() => copyCode(delivery.activeHandoverCode!)}
                  className="inline-flex items-center gap-1.5 text-xs bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg"
                >
                  <Copy className="w-3.5 h-3.5" />
                  کپی کد
                </button>
              </div>
            )}

            <p className="text-xs text-neutral-700 leading-6">
              {delivery.status === 'courier_requested'
                ? 'هنگام تحویل شیء به پیک مجاز، کد یک‌بارمصرف بالا را برای ثبت تحویل وارد و تأیید کنید.'
                : 'پس از تحویل شیء به مسئول نقطه امن انتخاب‌شده، نام مسئول و کد یک‌بارمصرف بالا را ثبت کنید تا رسید دیجیتال امانت صادر شود.'}
            </p>

            <form
              onSubmit={
                delivery.status === 'courier_requested'
                  ? handleConfirmCourierHandover
                  : handleConfirmSafePointDropoff
              }
              className="space-y-2.5"
            >
              {delivery.status === 'safe_point_selected' && (
                <input
                  type="text"
                  required
                  value={operatorName}
                  onChange={(e) => setOperatorName(e.target.value)}
                  placeholder="نام مسئول نقطه امن"
                  className="w-full bg-white border border-neutral-300 focus:border-[#0A0A0A] rounded-xl px-3.5 py-2.5 text-sm outline-none"
                />
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  maxLength={6}
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value)}
                  placeholder="کد ۶ رقمی یک‌بارمصرف را وارد کنید"
                  className="flex-1 bg-white border border-neutral-300 focus:border-[#0A0A0A] rounded-xl px-3.5 py-2.5 text-sm font-bold tracking-widest text-center outline-none"
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="bg-[#0A0A0A] hover:bg-neutral-800 text-[#FACC15] font-bold text-sm px-5 py-2.5 rounded-xl shrink-0 transition-colors disabled:opacity-60"
                >
                  {busy ? '...' : 'ثبت تحویل'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* LOSER FINAL RECEIPT CONFIRMATION STAGE */}
        {isLoser && (delivery.status === 'handed_to_courier' || delivery.status === 'received_at_safe_point') && (
          <div className="bg-emerald-50 border-2 border-emerald-600 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2 font-extrabold text-sm text-emerald-950">
              <KeyRound className="w-5 h-5 text-emerald-700" />
              <span>کد تحویل یک‌بارمصرف دریافت نهایی</span>
            </div>

            {delivery.activePickupCode && (
              <div className="bg-[#0A0A0A] text-[#FACC15] rounded-xl px-4 py-3 flex items-center justify-between">
                <span className="text-2xl font-black tracking-[0.25em] font-mono">
                  {toPersianDigits(delivery.activePickupCode)}
                </span>
                <button
                  type="button"
                  onClick={() => copyCode(delivery.activePickupCode!)}
                  className="inline-flex items-center gap-1.5 text-xs bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg"
                >
                  <Copy className="w-3.5 h-3.5" />
                  کپی کد
                </button>
              </div>
            )}

            <p className="text-xs text-emerald-900 leading-6">
              {delivery.status === 'handed_to_courier'
                ? 'شیء تحویل پیک شده است. پس از دریافت و بررسی سلامت شیء، کد یک‌بارمصرف بالا را وارد کنید تا تحویل نهایی و رسید دیجیتال ثبت شود.'
                : 'شیء در نقطه امن ثبت شده است. پس از مراجعه به نقطه امن و دریافت شیء، کد یک‌بارمصرف بالا را وارد کنید تا رسید دیجیتال نهایی صادر شود.'}
            </p>

            <form onSubmit={handleConfirmFinalDelivery} className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                required
                maxLength={6}
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                placeholder="کد ۶ رقمی یک‌بارمصرف"
                className="flex-1 bg-white border border-emerald-300 focus:border-emerald-700 rounded-xl px-3.5 py-2.5 text-sm font-bold tracking-widest text-center outline-none"
              />
              <button
                type="submit"
                disabled={busy}
                className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-sm px-5 py-2.5 rounded-xl shrink-0 transition-colors disabled:opacity-60"
              >
                {busy ? '...' : 'تأیید دریافت شیء'}
              </button>
            </form>
          </div>
        )}

        {/* Waiting messages for the non-acting party */}
        {isLoser && (delivery.status === 'courier_requested' || delivery.status === 'safe_point_selected') && (
          <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3.5 text-xs text-neutral-700 leading-6">
            {delivery.status === 'courier_requested'
              ? 'در انتظار تحویل شیء به پیک توسط یابنده. پس از تحویل به پیک، کد دریافت نهایی برای شما نمایش داده می‌شود.'
              : 'در انتظار تحویل شیء به نقطه امن توسط یابنده و ثبت دریافت توسط مسئول نقطه امن.'}
          </div>
        )}

        {isFinder && (delivery.status === 'handed_to_courier' || delivery.status === 'received_at_safe_point') && (
          <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3.5 text-xs text-neutral-700 leading-6">
            تحویل شما ثبت شده است. پس از دریافت شیء توسط مالک و ثبت کد یک‌بارمصرف، رسید دیجیتال نهایی صادر می‌شود.
          </div>
        )}
      </div>

      {/* DIGITAL RECEIPT (Visible to both parties once safe point intake or final delivery occurs) */}
      {(delivery.safePointReceiptNo || delivery.finalReceiptNo) && (
        <div className="bg-white rounded-2xl border-2 border-[#0A0A0A] overflow-hidden shadow-sm">
          <div className="bg-[#0A0A0A] text-white px-4 py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt className="w-5 h-5 text-[#FACC15]" />
              <span className="font-extrabold text-sm">رسید دیجیتال تحویل چی‌کجا</span>
            </div>
            {delivery.status === 'delivered' && (
              <span className="bg-emerald-500 text-white text-xs font-bold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                تکمیل‌شده
              </span>
            )}
          </div>
          <div className="p-4 space-y-2.5 text-xs sm:text-sm">
            <div className="flex justify-between py-1.5 border-b border-neutral-100">
              <span className="text-neutral-500">عنوان شیء:</span>
              <span className="font-bold text-[#0A0A0A]">{claim.item.title}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-neutral-100">
              <span className="text-neutral-500">روش تحویل:</span>
              <span className="font-bold">
                {delivery.method === 'safe_point' ? 'نقطه امن تهران' : 'ارسال با پیک مجاز'}
              </span>
            </div>
            {delivery.safePoint && (
              <div className="flex justify-between py-1.5 border-b border-neutral-100">
                <span className="text-neutral-500">نقطه امن:</span>
                <span className="font-semibold text-left">{delivery.safePoint.name}</span>
              </div>
            )}
            {delivery.safePointOperatorName && (
              <div className="flex justify-between py-1.5 border-b border-neutral-100">
                <span className="text-neutral-500">مسئول ثبت دریافت:</span>
                <span className="font-semibold">{delivery.safePointOperatorName}</span>
              </div>
            )}
            {delivery.safePointReceiptNo && (
              <div className="flex justify-between py-1.5 border-b border-neutral-100">
                <span className="text-neutral-500">شماره رسید تحویل اولیه:</span>
                <span className="font-mono font-bold text-[#0A0A0A]" dir="ltr">
                  {delivery.safePointReceiptNo}
                </span>
              </div>
            )}
            {delivery.finalReceiptNo && (
              <div className="flex justify-between py-1.5 border-b border-neutral-100">
                <span className="text-neutral-500">شماره رسید تحویل نهایی:</span>
                <span className="font-mono font-extrabold text-emerald-700" dir="ltr">
                  {delivery.finalReceiptNo}
                </span>
              </div>
            )}
            {delivery.handedOverAt && (
              <div className="flex justify-between py-1.5 border-b border-neutral-100">
                <span className="text-neutral-500">زمان تحویل اولیه:</span>
                <span>{formatJalaliDateTime(delivery.handedOverAt)}</span>
              </div>
            )}
            {delivery.deliveredAt && (
              <div className="flex justify-between py-1.5">
                <span className="text-neutral-500">زمان تحویل نهایی به مالک:</span>
                <span className="font-bold text-emerald-700">
                  {formatJalaliDateTime(delivery.deliveredAt)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Immutable Status Audit Log */}
      {delivery.auditLogs.length > 0 && (
        <div className="bg-white rounded-2xl border border-neutral-200 p-4">
          <div className="flex items-center gap-2 text-xs font-bold text-neutral-700 mb-3">
            <History className="w-4 h-4 text-[#0A0A0A]" />
            <span>سوابق ثبت‌شده تغییر وضعیت تحویل</span>
          </div>
          <ol className="space-y-2.5 border-r-2 border-neutral-200 pr-3.5">
            {delivery.auditLogs.map((log) => (
              <li key={log.id} className="text-xs relative">
                <span className="w-2.5 h-2.5 rounded-full bg-[#FACC15] border-2 border-[#0A0A0A] absolute -right-[21px] top-1" />
                <div className="font-semibold text-[#0A0A0A]">{log.note || log.to_status}</div>
                <div className="text-[11px] text-neutral-500 mt-0.5">
                  {formatJalaliDateTime(log.created_at)}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
};
