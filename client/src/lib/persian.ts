const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

export function toPersianDigits(input: string | number): string {
  return String(input).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
}

export function formatJalaliDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'Asia/Tehran',
    }).format(date);
  } catch {
    return toPersianDigits(date.toLocaleDateString('fa-IR'));
  }
}

export function formatJalaliDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Tehran',
    }).format(date);
  } catch {
    return toPersianDigits(date.toLocaleString('fa-IR'));
  }
}

export function formatTimeOnly(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('fa-IR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Tehran',
    }).format(date);
  } catch {
    return toPersianDigits(date.toLocaleTimeString('fa-IR'));
  }
}

export function formatDistance(meters: number | null | undefined): string {
  if (meters === null || meters === undefined) return '';
  if (meters < 1000) {
    return `${toPersianDigits(Math.max(50, Math.round(meters / 50) * 50))} متر`;
  }
  const km = (meters / 1000).toFixed(1).replace('.0', '');
  return `${toPersianDigits(km)} کیلومتر`;
}

export function formatRemainingTime(expiresAtIso: string): {
  expired: boolean;
  nearExpiry: boolean;
  label: string;
} {
  const diffMs = new Date(expiresAtIso).getTime() - Date.now();
  if (diffMs <= 0) {
    return { expired: true, nearExpiry: false, label: 'منقضی شده' };
  }
  const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  const nearExpiry = totalHours < 12;

  if (days > 0) {
    return {
      expired: false,
      nearExpiry,
      label: `${toPersianDigits(days)} روز و ${toPersianDigits(hours)} ساعت باقی‌مانده`,
    };
  }
  if (hours > 0) {
    return {
      expired: false,
      nearExpiry,
      label: `${toPersianDigits(hours)} ساعت و ${toPersianDigits(minutes)} دقیقه باقی‌مانده`,
    };
  }
  return {
    expired: false,
    nearExpiry: true,
    label: `${toPersianDigits(Math.max(1, minutes))} دقیقه باقی‌مانده`,
  };
}

export const TIME_SLOTS = [
  { id: 'all_day', label: 'تمام روز (نامشخص)' },
  { id: 'morning', label: 'صبح (۶ تا ۱۲)' },
  { id: 'noon', label: 'ظهر (۱۲ تا ۱۵)' },
  { id: 'evening', label: 'عصر (۱۵ تا ۱۹)' },
  { id: 'night', label: 'شب (۱۹ تا ۲۴)' },
] as const;

export function getTimeSlotLabel(slot: string): string {
  return TIME_SLOTS.find((t) => t.id === slot)?.label || 'تمام روز';
}

export function getRecentDateOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  const names = ['امروز', 'دیروز', '۲ روز پیش', '۳ روز پیش', '۴ روز پیش', '۵ روز پیش'];
  for (let i = 0; i < names.length; i++) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const isoDate = d.toISOString().slice(0, 10);
    options.push({
      value: isoDate,
      label: `${names[i]} (${formatJalaliDate(d.toISOString())})`,
    });
  }
  return options;
}

export const DELIVERY_STATUS_LABELS: Record<string, string> = {
  pending_coordination: 'در انتظار هماهنگی تحویل',
  courier_requested: 'درخواست ارسال با پیک ثبت شد',
  handed_to_courier: 'تحویل پیک شد (در مسیر مالک)',
  safe_point_selected: 'نقطه امن انتخاب شد (در انتظار تحویل یابنده)',
  received_at_safe_point: 'دریافت در نقطه امن ثبت شد (آماده تحویل به مالک)',
  delivered: 'تحویل نهایی انجام و رسید دیجیتال صادر شد',
};
