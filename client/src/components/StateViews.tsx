import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WifiOff, RefreshCw, AlertCircle, ArrowRight } from 'lucide-react';

export const OfflineBanner: React.FC = () => {
  const [offline, setOffline] = useState(() =>
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );

  useEffect(() => {
    const onOffline = () => setOffline(true);
    const onOnline = () => setOffline(false);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="alert"
      className="bg-red-600 text-white px-4 py-2.5 text-xs sm:text-sm font-medium flex items-center justify-center gap-2 sticky top-14 z-40"
    >
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>اتصال اینترنت قطع شده است. برخی قابلیت‌ها تا زمان برقراری مجدد اینترنت در دسترس نیستند.</span>
    </div>
  );
};

export const PageHeader: React.FC<{
  title: string;
  subtitle?: string;
  backTo?: string;
  action?: React.ReactNode;
}> = ({ title, subtitle, backTo, action }) => {
  const navigate = useNavigate();

  const handleBack = () => {
    if (backTo) {
      navigate(backTo);
    } else if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 mb-5">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={handleBack}
          className="w-10 h-10 rounded-xl bg-white border border-neutral-200 hover:border-[#0A0A0A] flex items-center justify-center text-[#0A0A0A] shrink-0 transition-colors"
          aria-label="بازگشت"
        >
          <ArrowRight className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-extrabold text-[#0A0A0A] truncate">{title}</h1>
          {subtitle && <p className="text-xs sm:text-sm text-neutral-500 mt-0.5 truncate">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
};

export const LoadingSkeleton: React.FC<{ rows?: number }> = ({ rows = 3 }) => (
  <div className="space-y-3" aria-label="در حال بارگذاری">
    {Array.from({ length: rows }).map((_, i) => (
      <div
        key={i}
        className="bg-white rounded-2xl border border-neutral-200/80 p-4 animate-pulse flex gap-4"
      >
        <div className="w-20 h-20 rounded-xl bg-neutral-200 shrink-0" />
        <div className="flex-1 space-y-2.5 py-1">
          <div className="h-4 bg-neutral-200 rounded w-3/4" />
          <div className="h-3 bg-neutral-200 rounded w-1/2" />
          <div className="h-3 bg-neutral-100 rounded w-1/3" />
        </div>
      </div>
    ))}
  </div>
);

export const EmptyState: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}> = ({ icon, title, description, action }) => (
  <div className="bg-white rounded-3xl border border-neutral-200/80 p-8 text-center flex flex-col items-center">
    <div className="w-14 h-14 rounded-2xl bg-[#FEF9C3] text-[#0A0A0A] flex items-center justify-center mb-4">
      {icon}
    </div>
    <h3 className="text-base font-bold text-[#0A0A0A] mb-1.5">{title}</h3>
    <p className="text-sm text-neutral-600 max-w-sm leading-6 mb-5">{description}</p>
    {action}
  </div>
);

export const ErrorState: React.FC<{
  message: string;
  onRetry?: () => void;
}> = ({ message, onRetry }) => (
  <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center flex flex-col items-center">
    <AlertCircle className="w-10 h-10 text-red-600 mb-3" />
    <p className="text-sm font-semibold text-red-900 mb-4 leading-6">{message}</p>
    {onRetry && (
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-2 bg-[#0A0A0A] text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-neutral-800 transition-colors"
      >
        <RefreshCw className="w-4 h-4" />
        <span>تلاش مجدد</span>
      </button>
    )}
  </div>
);
