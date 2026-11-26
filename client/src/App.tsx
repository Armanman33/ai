import React from 'react';
import {
  BrowserRouter,
  Link,
  NavLink,
  Route,
  Routes,
} from 'react-router-dom';
import {
  Home,
  Package,
  BellRing,
  Inbox,
  Bell,
  UserCircle2,
  LogIn,
} from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { NotificationPopup } from './components/NotificationPopup';
import { ErrorState, LoadingSkeleton, OfflineBanner } from './components/StateViews';
import { toPersianDigits } from './lib/persian';

import { HomePage } from './pages/HomePage';
import { AuthPage } from './pages/AuthPage';
import { LostFlowPage } from './pages/LostFlowPage';
import { FoundFlowPage } from './pages/FoundFlowPage';
import { ItemDetailPage } from './pages/ItemDetailPage';
import { MyAdsPage } from './pages/MyAdsPage';
import { MyAlertsPage } from './pages/MyAlertsPage';
import { RequestsPage } from './pages/RequestsPage';
import { ClaimRoomPage } from './pages/ClaimRoomPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { ProfilePage } from './pages/ProfilePage';

const PeydashLogo: React.FC = () => (
  <Link to="/" className="flex items-center gap-2.5 shrink-0">
    <div className="w-9 h-9 rounded-xl bg-[#FACC15] text-[#0A0A0A] flex items-center justify-center shadow-xs">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 2C7.58 2 4 5.58 4 10C4 15.75 12 22 12 22C12 22 20 15.75 20 10C20 5.58 16.42 2 12 2Z"
          fill="#0A0A0A"
        />
        <circle cx="12" cy="9.5" r="3" fill="#FACC15" />
      </svg>
    </div>
    <div className="leading-tight">
      <div className="text-base font-black text-white tracking-tight">پیداش</div>
      <div className="text-[10px] font-semibold text-[#FACC15]">تهران</div>
    </div>
  </Link>
);

const AppShell: React.FC = () => {
  const { user, counts, loading, metaError, refreshMeta } = useAuth();

  const desktopNav = [
    { to: '/', label: 'خانه', end: true },
    { to: '/my-ads', label: 'آگهی‌های من', count: counts.myAds },
    { to: '/my-alerts', label: 'هشدارهای من', count: counts.myActiveAlerts },
    { to: '/requests', label: 'درخواست‌ها', count: counts.incomingRequests + counts.myRequests },
  ];

  const mobileTabs = [
    { to: '/', label: 'خانه', icon: Home, end: true },
    { to: '/my-ads', label: 'آگهی‌ها', icon: Package },
    { to: '/my-alerts', label: 'هشدارها', icon: BellRing },
    {
      to: '/requests',
      label: 'درخواست‌ها',
      icon: Inbox,
      badge: user ? counts.incomingRequests + counts.myRequests : 0,
    },
    { to: '/profile', label: 'پروفایل', icon: UserCircle2 },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F7F5] text-[#111111]">
      {/* Sticky Top Header (Black & Yellow structural chrome) */}
      <header className="sticky top-0 z-40 bg-[#0A0A0A] text-white border-b border-white/10">
        <div className="max-w-5xl mx-auto px-4 h-15 flex items-center justify-between gap-4">
          <PeydashLogo />

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1" aria-label="منوی اصلی">
            {desktopNav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `px-3.5 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 ${
                    isActive
                      ? 'bg-[#FACC15] text-[#0A0A0A]'
                      : 'text-neutral-300 hover:text-white hover:bg-white/10'
                  }`
                }
              >
                <span>{item.label}</span>
                {user && item.count !== undefined && item.count > 0 && (
                  <span className="bg-black/20 px-1.5 py-0.5 rounded-full text-[10px]">
                    {toPersianDigits(item.count)}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>

          {/* Header Right Actions (Notifications + Profile / Login) */}
          <div className="flex items-center gap-2">
            <Link
              to="/notifications"
              className="relative w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
              aria-label="اعلان‌ها"
              title="اعلان‌ها"
            >
              <Bell className="w-5 h-5" />
              {user && counts.unreadNotifications > 0 && (
                <span className="absolute -top-1 -left-1 min-w-5 h-5 px-1 rounded-full bg-[#FACC15] text-[#0A0A0A] text-[10px] font-black flex items-center justify-center border-2 border-[#0A0A0A]">
                  {toPersianDigits(counts.unreadNotifications)}
                </span>
              )}
            </Link>

            {user ? (
              <Link
                to="/profile"
                className="inline-flex items-center gap-1.5 sm:gap-2 bg-white/10 hover:bg-white/20 px-2.5 sm:px-3 py-2 rounded-xl text-xs font-bold text-white transition-colors"
              >
                <UserCircle2 className="w-4 h-4 text-[#FACC15] shrink-0" />
                <span className="max-w-20 sm:max-w-28 truncate">{user.displayName}</span>
              </Link>
            ) : (
              <Link
                to="/auth"
                className="inline-flex items-center gap-1.5 bg-[#FACC15] hover:bg-[#EAB308] text-[#0A0A0A] px-3.5 py-2 rounded-xl text-xs font-extrabold transition-colors"
              >
                <LogIn className="w-4 h-4" />
                <span>ورود</span>
              </Link>
            )}
          </div>
        </div>
      </header>

      <OfflineBanner />

      {/* Main Content */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 pt-5 pb-24 md:pb-10">
        {loading ? (
          <LoadingSkeleton rows={4} />
        ) : metaError ? (
          <ErrorState message={metaError} onRetry={refreshMeta} />
        ) : (
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/lost" element={<LostFlowPage />} />
            <Route path="/found" element={<FoundFlowPage />} />
            <Route path="/items/:id" element={<ItemDetailPage />} />
            <Route path="/my-ads" element={<MyAdsPage />} />
            <Route path="/my-alerts" element={<MyAlertsPage />} />
            <Route path="/requests" element={<RequestsPage />} />
            <Route path="/claims/:id" element={<ClaimRoomPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route
              path="*"
              element={
                <div className="bg-white rounded-3xl border border-neutral-200 p-8 text-center space-y-3">
                  <h1 className="text-xl font-black">صفحه موردنظر یافت نشد</h1>
                  <p className="text-sm text-neutral-600">مسیر واردشده در پیداش وجود ندارد.</p>
                  <Link
                    to="/"
                    className="inline-block bg-[#FACC15] text-[#0A0A0A] font-extrabold text-sm px-5 py-2.5 rounded-xl"
                  >
                    بازگشت به صفحه اصلی
                  </Link>
                </div>
              }
            />
          </Routes>
        )}
      </main>

      {/* Mobile Bottom Tab Bar */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[#0A0A0A] text-white border-t border-white/10 px-2 pb-[env(safe-area-inset-bottom)]"
        aria-label="ناوبری پایین"
      >
        <div className="grid grid-cols-5 h-16">
          {mobileTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center gap-1 text-[10px] font-bold transition-colors relative ${
                    isActive ? 'text-[#FACC15]' : 'text-neutral-400 hover:text-white'
                  }`
                }
              >
                <div className="relative">
                  <Icon className="w-5 h-5" />
                  {tab.badge !== undefined && tab.badge > 0 && (
                    <span className="absolute -top-1.5 -left-2 min-w-4 h-4 px-1 rounded-full bg-[#FACC15] text-[#0A0A0A] text-[9px] font-black flex items-center justify-center">
                      {toPersianDigits(tab.badge)}
                    </span>
                  )}
                </div>
                <span>{tab.label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>

      {/* Post-login Notification Enablement Popup */}
      <NotificationPopup />
    </div>
  );
};

export const App: React.FC = () => (
  <BrowserRouter>
    <ToastProvider>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </ToastProvider>
  </BrowserRouter>
);

export default App;
