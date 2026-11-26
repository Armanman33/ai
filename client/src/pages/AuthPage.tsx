import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Smartphone, KeyRound, ShieldCheck, ArrowRight, RefreshCw } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { toPersianDigits } from '../lib/persian';
import { UserCounts, UserProfile } from '../types';

export const AuthPage: React.FC = () => {
  const { user, completeLogin } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const returnTo = (location.state as { from?: string } | null)?.from || '/';

  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [sandboxCode, setSandboxCode] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      navigate(returnTo, { replace: true });
    }
  }, [user, navigate, returnTo]);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [countdown]);

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const cleanedPhone = phone.trim();
    if (!cleanedPhone) {
      setError('لطفاً شماره موبایل خود را وارد کنید.');
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch<{
        ok: boolean;
        expiresInSeconds: number;
        sandboxCode?: string;
      }>('/api/auth/request-otp', {
        method: 'POST',
        body: JSON.stringify({ phone: cleanedPhone }),
      });
      setSandboxCode(res.sandboxCode || null);
      setCountdown(res.expiresInSeconds || 180);
      setStep('otp');
      showToast('کد تأیید پیامکی ارسال شد.', 'success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ارسال کد تأیید');
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const cleanedCode = code.trim();
    if (!cleanedCode) {
      setError('لطفاً کد ۵ رقمی ارسال‌شده را وارد کنید.');
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch<{
        ok: boolean;
        token: string;
        user: UserProfile;
        counts?: UserCounts;
      }>('/api/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({
          phone: phone.trim(),
          code: cleanedCode,
          ...(displayName.trim().length >= 2 ? { displayName: displayName.trim() } : {}),
        }),
      });
      completeLogin(res.token, res.user, res.counts);
      showToast('خوش آمدید! ورود شما با موفقیت انجام شد.', 'success');
      navigate(returnTo, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'کد تأیید نادرست است.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md mx-auto py-4 sm:py-8">
      <div className="bg-white rounded-3xl border border-neutral-200 overflow-hidden shadow-sm">
        <div className="bg-[#0A0A0A] text-white px-6 py-7 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#FACC15] text-[#0A0A0A] flex items-center justify-center mx-auto mb-3.5 shadow-md">
            {step === 'phone' ? <Smartphone className="w-7 h-7" /> : <KeyRound className="w-7 h-7" />}
          </div>
          <h1 className="text-xl font-extrabold">
            {step === 'phone' ? 'ورود یا ثبت‌نام در پیداش' : 'تأیید کد پیامکی'}
          </h1>
          <p className="text-xs sm:text-sm text-neutral-300 mt-1.5">
            {step === 'phone'
              ? 'شماره موبایل خود را وارد کنید تا کد تأیید پیامک شود'
              : `کد ۵ رقمی ارسال‌شده به ${toPersianDigits(phone)} را وارد کنید`}
          </p>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-3 text-xs sm:text-sm font-medium">
              {error}
            </div>
          )}

          {step === 'phone' ? (
            <form onSubmit={handleRequestOtp} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-[#0A0A0A] mb-1.5">
                  شماره موبایل
                </label>
                <input
                  type="tel"
                  inputMode="tel"
                  dir="ltr"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="09123456789"
                  className="w-full text-left bg-neutral-50 border border-neutral-300 focus:border-[#0A0A0A] focus:bg-white rounded-xl px-4 py-3.5 text-base font-bold tracking-wider outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-600 mb-1.5">
                  نام نمایشی (اختیاری — برای کاربران جدید)
                </label>
                <input
                  type="text"
                  maxLength={60}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="مثلاً: علی رضایی"
                  className="w-full bg-neutral-50 border border-neutral-300 focus:border-[#0A0A0A] focus:bg-white rounded-xl px-4 py-3 text-sm outline-none transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full bg-[#FACC15] hover:bg-[#EAB308] text-[#0A0A0A] font-extrabold text-sm sm:text-base py-3.5 rounded-xl transition-colors disabled:opacity-60 shadow-sm"
              >
                {busy ? 'در حال ارسال کد...' : 'دریافت کد تأیید پیامکی'}
              </button>

              <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-3.5 flex items-start gap-2.5 text-xs text-neutral-600 leading-6">
                <ShieldCheck className="w-4 h-4 text-[#0A0A0A] shrink-0 mt-1" />
                <span>
                  شماره موبایل شما صرفاً برای ورود امن و اطلاع‌رسانی استفاده می‌شود و هرگز برای هیچ کاربر دیگری نمایش داده نخواهد شد.
                </span>
              </div>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              {sandboxCode && (
                <div className="bg-[#FEFCE8] border border-[#FACC15] rounded-2xl p-3.5 text-xs text-[#0A0A0A] flex items-center justify-between gap-2">
                  <div>
                    <div className="font-bold">پیامک محیط آزمایشی (Sandbox SMS):</div>
                    <div className="text-neutral-700 mt-0.5">
                      کد تأیید تولیدشده:{' '}
                      <strong className="text-base font-mono tracking-widest">
                        {toPersianDigits(sandboxCode)}
                      </strong>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCode(sandboxCode)}
                    className="bg-[#0A0A0A] text-[#FACC15] font-bold px-3 py-1.5 rounded-lg text-xs shrink-0"
                  >
                    درج خودکار
                  </button>
                </div>
              )}

              <div>
                <label className="block text-sm font-bold text-[#0A0A0A] mb-1.5">
                  کد تأیید ۵ رقمی
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  dir="ltr"
                  required
                  maxLength={5}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="12345"
                  className="w-full text-center bg-neutral-50 border border-neutral-300 focus:border-[#0A0A0A] focus:bg-white rounded-xl px-4 py-3.5 text-2xl font-black tracking-[0.4em] outline-none transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full bg-[#FACC15] hover:bg-[#EAB308] text-[#0A0A0A] font-extrabold text-sm sm:text-base py-3.5 rounded-xl transition-colors disabled:opacity-60"
              >
                {busy ? 'در حال بررسی...' : 'تأیید و ورود به پیداش'}
              </button>

              <div className="flex items-center justify-between text-xs pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setStep('phone');
                    setCode('');
                    setError(null);
                  }}
                  className="inline-flex items-center gap-1 text-neutral-600 hover:text-[#0A0A0A] font-semibold"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  ویرایش شماره موبایل
                </button>

                {countdown > 0 ? (
                  <span className="text-neutral-500">
                    ارسال مجدد تا {toPersianDigits(countdown)} ثانیه دیگر
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleRequestOtp}
                    className="inline-flex items-center gap-1 text-[#0A0A0A] font-bold underline"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    ارسال مجدد کد
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
