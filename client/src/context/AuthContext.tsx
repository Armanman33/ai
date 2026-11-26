import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ApiError, apiFetch, setStoredToken } from '../lib/api';
import { MetaConfig, UserCounts, UserProfile } from '../types';

const NOTIF_DISMISS_SESSION_KEY = 'peydash_notif_popup_dismissed_this_visit';

interface AuthContextValue {
  user: UserProfile | null;
  counts: UserCounts;
  meta: MetaConfig | null;
  loading: boolean;
  metaError: string | null;
  showNotifPopup: boolean;
  refreshMe: () => Promise<void>;
  refreshMeta: () => Promise<void>;
  completeLogin: (token: string, user: UserProfile, initialCounts?: UserCounts) => void;
  logout: () => Promise<void>;
  enableNotifications: () => Promise<void>;
  dismissNotifPopupForVisit: () => void;
  updateProfile: (patch: { displayName?: string; notificationsEnabled?: boolean }) => Promise<void>;
}

const DEFAULT_COUNTS: UserCounts = {
  unreadNotifications: 0,
  myAds: 0,
  myActiveAlerts: 0,
  incomingRequests: 0,
  myRequests: 0,
};

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [counts, setCounts] = useState<UserCounts>(DEFAULT_COUNTS);
  const [meta, setMeta] = useState<MetaConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [dismissedVisit, setDismissedVisit] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(NOTIF_DISMISS_SESSION_KEY) === '1';
    } catch {
      return false;
    }
  });

  // Prevents stale pre-login /api/auth/me calls from clobbering a freshly authenticated session
  const authEpochRef = useRef(0);

  const refreshMeta = useCallback(async () => {
    try {
      setMetaError(null);
      const data = await apiFetch<MetaConfig>('/api/meta/config');
      setMeta(data);
    } catch (err) {
      setMetaError(err instanceof Error ? err.message : 'خطا در دریافت تنظیمات سامانه');
    }
  }, []);

  const refreshMe = useCallback(async () => {
    const epoch = authEpochRef.current;
    try {
      const data = await apiFetch<{ user: UserProfile; counts: UserCounts }>('/api/auth/me');
      if (epoch !== authEpochRef.current) return;
      setUser(data.user);
      setCounts(data.counts);
    } catch (err) {
      if (epoch !== authEpochRef.current) return;
      // Only clear user state on genuine 401 unauthorized (not transient network failures)
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
        setCounts(DEFAULT_COUNTS);
      }
    }
  }, []);

  useEffect(() => {
    Promise.all([refreshMeta(), refreshMe()]).finally(() => setLoading(false));
  }, [refreshMeta, refreshMe]);

  // Periodically refresh unread counts when logged in
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      void refreshMe();
    }, 25_000);
    return () => clearInterval(interval);
  }, [user, refreshMe]);

  const completeLogin = useCallback(
    (token: string, loggedInUser: UserProfile, initialCounts?: UserCounts) => {
      authEpochRef.current += 1;
      setStoredToken(token);
      setUser(loggedInUser);
      if (initialCounts) {
        setCounts(initialCounts);
      }
      // Reset visit dismissal on fresh login so if notifications are disabled, popup shows again
      try {
        sessionStorage.removeItem(NOTIF_DISMISS_SESSION_KEY);
      } catch {
        // ignore
      }
      setDismissedVisit(false);
    },
    []
  );

  const logout = useCallback(async () => {
    authEpochRef.current += 1;
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore logout network errors
    }
    setStoredToken(null);
    setUser(null);
    setCounts(DEFAULT_COUNTS);
    try {
      sessionStorage.removeItem(NOTIF_DISMISS_SESSION_KEY);
    } catch {
      // ignore
    }
    setDismissedVisit(false);
  }, []);

  const updateProfile = useCallback(
    async (patch: { displayName?: string; notificationsEnabled?: boolean }) => {
      const res = await apiFetch<{ ok: boolean; user: UserProfile }>('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      setUser(res.user);
    },
    []
  );

  const enableNotifications = useCallback(async () => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch {
        // fallback cleanly to in-app + SMS notifications
      }
    }
    await updateProfile({ notificationsEnabled: true });
  }, [updateProfile]);

  const dismissNotifPopupForVisit = useCallback(() => {
    try {
      sessionStorage.setItem(NOTIF_DISMISS_SESSION_KEY, '1');
    } catch {
      // ignore
    }
    setDismissedVisit(true);
  }, []);

  // Requirement section 4:
  // After login, if notifications are disabled -> show popup.
  // If user picks "فعلاً نه" -> dismiss for current visit, show again on next visit/login.
  // If notifications are enabled -> NEVER show popup again!
  const showNotifPopup = Boolean(user && !user.notificationsEnabled && !dismissedVisit);

  return (
    <AuthContext.Provider
      value={{
        user,
        counts,
        meta,
        loading,
        metaError,
        showNotifPopup,
        refreshMe,
        refreshMeta,
        completeLogin,
        logout,
        enableNotifications,
        dismissNotifPopupForVisit,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
