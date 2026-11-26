import React from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  PlusCircle,
  Package,
  BellRing,
  Inbox,
  Bell,
  UserCircle2,
  MapPin,
  ShieldCheck,
  KeyRound,
  Truck,
  ChevronLeft,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { toPersianDigits } from '../lib/persian';

export const HomePage: React.FC = () => {
  const { user, counts } = useAuth();

  const quickSections = [
    {
      to: '/my-ads',
      title: 'آگهی‌های ثبت‌شده من',
      subtitle: 'مدیریت اشیای پیدا شده و تمدید آگهی‌ها',
      icon: Package,
      count: user ? counts.myAds : 0,
    },
    {
      to: '/my-alerts',
      title: 'هشدارهای من',
      subtitle: 'پیگیری هشدارهای ۵ روزه اشیای گمشده',
      icon: BellRing,
      count: user ? counts.myActiveAlerts : 0,
    },
    {
      to: '/requests',
      title: 'درخواست‌های دریافتی',
      subtitle: 'بررسی مالکیت، گفت‌وگو و تحویل امن',
      icon: Inbox,
      count: user ? counts.incomingRequests + counts.myRequests : 0,
    },
    {
      to: '/notifications',
      title: 'اعلان‌ها',
      subtitle: 'اطلاع‌رسانی موارد مشابه و وضعیت تحویل',
      icon: Bell,
      count: user ? counts.unreadNotifications : 0,
      highlight: user ? counts.unreadNotifications > 0 : false,
    },
    {
      to: '/profile',
      title: 'پروفایل و تنظیمات',
      subtitle: 'تنظیمات اعلان‌ها، حریم خصوصی و مسدودسازی',
      icon: UserCircle2,
      count: 0,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Hero Section: Two Primary Unmistakable Actions */}
      <section className="bg-[#0A0A0A] text-white rounded-3xl p-5 sm:p-8 shadow-lg relative overflow-hidden">
        <div className="absolute -left-16 -top-16 w-52 h-52 rounded-full bg-[#FACC15]/10 blur-2xl pointer-events-none" />
        <div className="relative z-10">
          <div className="inline-flex items-center gap-1.5 bg-white/10 text-[#FACC15] text-xs font-bold px-3 py-1.5 rounded-full mb-4">
            <MapPin className="w-3.5 h-3.5" />
            <span>ویژه شهر تهران</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black leading-snug tracking-tight">
            اشیای گمشده خود را در تهران،{' '}
            <span className="text-[#FACC15]">سریع و امن</span> پیدا کنید
          </h1>
          <p className="text-sm text-neutral-300 mt-2.5 max-w-xl leading-7">
            چی‌کجا میان فرد گم‌کننده و یابنده، بدون نمایش شماره تماس و با تأیید مالکیت از طریق سه پرسش محرمانه ارتباط امن برقرار می‌کند.
          </p>

          {/* TWO PRIMARY ACTIONS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-6">
            <Link
              to="/lost"
              className="group bg-[#FACC15] hover:bg-[#EAB308] text-[#0A0A0A] rounded-2xl p-5 flex items-center justify-between gap-4 transition-all shadow-md"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-[#0A0A0A] text-[#FACC15] flex items-center justify-center shrink-0">
                  <Search className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-lg font-black">گم کرده‌ام</div>
                  <div className="text-xs font-medium text-neutral-800 mt-0.5">
                    جست‌وجو در محدوده تهران یا ثبت هشدار
                  </div>
                </div>
              </div>
              <ChevronLeft className="w-5 h-5 shrink-0 transition-transform group-hover:-translate-x-1" />
            </Link>

            <Link
              to="/found"
              className="group bg-white hover:bg-neutral-100 text-[#0A0A0A] rounded-2xl p-5 flex items-center justify-between gap-4 transition-all border-2 border-white"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-[#FEF9C3] border border-[#FACC15] text-[#0A0A0A] flex items-center justify-center shrink-0">
                  <PlusCircle className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-lg font-black">پیدا کرده‌ام</div>
                  <div className="text-xs font-medium text-neutral-600 mt-0.5">
                    ثبت سریع شیء پیدا شده در کمتر از یک دقیقه
                  </div>
                </div>
              </div>
              <ChevronLeft className="w-5 h-5 shrink-0 transition-transform group-hover:-translate-x-1" />
            </Link>
          </div>
        </div>
      </section>

      {/* Main Dashboard Sections (Section 3 of Requirements) */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-extrabold text-[#0A0A0A]">بخش‌های کاربری شما</h2>
          {!user && (
            <Link
              to="/auth"
              className="text-xs font-bold bg-[#0A0A0A] text-[#FACC15] px-3 py-1.5 rounded-xl hover:bg-neutral-800 transition-colors"
            >
              ورود با شماره موبایل
            </Link>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {quickSections.map((sec) => {
            const Icon = sec.icon;
            return (
              <Link
                key={sec.to}
                to={sec.to}
                className="bg-white hover:border-[#0A0A0A] rounded-2xl border border-neutral-200/90 p-4 flex items-center justify-between gap-3 transition-all group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                      sec.highlight
                        ? 'bg-[#FACC15] text-[#0A0A0A]'
                        : 'bg-neutral-100 text-[#0A0A0A] group-hover:bg-[#FEF9C3]'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-[#0A0A0A] truncate">{sec.title}</div>
                    <div className="text-xs text-neutral-500 mt-0.5 truncate">{sec.subtitle}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {sec.count > 0 && (
                    <span
                      className={`text-xs font-extrabold px-2.5 py-0.5 rounded-full ${
                        sec.highlight
                          ? 'bg-red-600 text-white'
                          : 'bg-[#0A0A0A] text-[#FACC15]'
                      }`}
                    >
                      {toPersianDigits(sec.count)}
                    </span>
                  )}
                  <ChevronLeft className="w-4 h-4 text-neutral-400 group-hover:text-[#0A0A0A]" />
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Clear 3-pillar trust overview */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-neutral-200/80 p-4">
          <div className="w-9 h-9 rounded-xl bg-[#FEF9C3] text-[#0A0A0A] flex items-center justify-center mb-2.5">
            <KeyRound className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-[#0A0A0A]">احراز مالکیت با ۳ پرسش محرمانه</h3>
          <p className="text-xs text-neutral-600 mt-1 leading-6">
            تصاویر و جزئیات تا زمان پاسخ صحیح به ۳ پرسش یابنده محرمانه می‌مانند.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-neutral-200/80 p-4">
          <div className="w-9 h-9 rounded-xl bg-[#FEF9C3] text-[#0A0A0A] flex items-center justify-center mb-2.5">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-[#0A0A0A]">حفظ کامل حریم خصوصی</h3>
          <p className="text-xs text-neutral-600 mt-1 leading-6">
            شماره تماس و نشانی منزل هیچ کاربری برای طرف مقابل نمایش داده نمی‌شود.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-neutral-200/80 p-4">
          <div className="w-9 h-9 rounded-xl bg-[#FEF9C3] text-[#0A0A0A] flex items-center justify-center mb-2.5">
            <Truck className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-[#0A0A0A]">تحویل با پیک یا نقطه امن</h3>
          <p className="text-xs text-neutral-600 mt-1 leading-6">
            تحویل فقط با کد یک‌بارمصرف و رسید دیجیتال انجام می‌شود؛ مدارک صرفاً در نقطه امن.
          </p>
        </div>
      </section>
    </div>
  );
};
