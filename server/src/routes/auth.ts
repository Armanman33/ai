import { Router } from 'express';
import { z } from 'zod';
import { CONFIG } from '../config.js';
import { addDaysIso, addMinutesIso, getDb, nowIso } from '../db/database.js';
import { requireAuth, SESSION_COOKIE_NAME } from '../middleware/auth.js';
import { sendOtpSms } from '../providers/sms.js';
import { runLifecycleSweep } from '../services/lifecycleService.js';
import {
  generateId,
  generateOtpCode,
  generateSessionToken,
  hashSecret,
  safeEqual,
} from '../utils/crypto.js';
import { maskPhoneForSelf, normalizeIranPhone, toAsciiDigits } from '../utils/persian.js';
import { createRateLimiter } from '../utils/rateLimit.js';

export const authRouter = Router();

const otpRequestLimiter = createRateLimiter({
  keyPrefix: 'otp-req',
  windowMs: 5 * 60 * 1000,
  max: 8,
  message: 'درخواست‌های ارسال کد تأیید بیش از حد مجاز است. لطفاً چند دقیقه صبر کنید.',
});

const otpVerifyLimiter = createRateLimiter({
  keyPrefix: 'otp-verify',
  windowMs: 5 * 60 * 1000,
  max: 15,
  message: 'تعداد تلاش‌های ورود بیش از حد مجاز است. لطفاً چند دقیقه بعد تلاش کنید.',
});

const requestOtpSchema = z.object({
  phone: z.string().min(10).max(20),
});

authRouter.post('/request-otp', otpRequestLimiter, async (req, res) => {
  const parsed = requestOtpSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'شماره موبایل معتبر نیست. مثال: ۰۹۱۲۳۴۵۶۷۸۹' });
    return;
  }

  const phone = normalizeIranPhone(parsed.data.phone);
  if (!phone) {
    res.status(400).json({ error: 'لطفاً یک شماره موبایل معتبر ایران با شروع ۰۹ وارد کنید.' });
    return;
  }

  const db = getDb();
  const now = new Date();
  const code = generateOtpCode();
  const codeHash = hashSecret(`otp:${phone}:${code}`);

  // Invalidate previous unused OTPs for this phone
  db.prepare(`UPDATE otp_codes SET used_at = ? WHERE phone = ? AND used_at IS NULL`).run(
    now.toISOString(),
    phone
  );

  db.prepare(`
    INSERT INTO otp_codes (id, phone, code_hash, expires_at, attempts, created_at)
    VALUES (?, ?, ?, ?, 0, ?)
  `).run(generateId(), phone, codeHash, addMinutesIso(now, CONFIG.OTP_EXPIRY_MINUTES), now.toISOString());

  const smsRes = await sendOtpSms(phone, code);
  if (!smsRes.sent) {
    res.status(502).json({ error: 'ارسال پیامک کد تأیید با خطا مواجه شد. لطفاً دوباره تلاش کنید.' });
    return;
  }

  res.json({
    ok: true,
    phoneMasked: maskPhoneForSelf(phone),
    expiresInSeconds: CONFIG.OTP_EXPIRY_MINUTES * 60,
    provider: smsRes.provider,
    // Only provided in sandbox SMS mode so users can test without an external Iranian SMS gateway key
    ...(smsRes.sandboxCode ? { sandboxCode: smsRes.sandboxCode } : {}),
  });
});

const verifyOtpSchema = z.object({
  phone: z.string().min(10).max(20),
  code: z.string().min(4).max(8),
  displayName: z.string().trim().min(2).max(60).optional(),
});

authRouter.post('/verify-otp', otpVerifyLimiter, (req, res) => {
  const parsed = verifyOtpSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'اطلاعات ورود ناقص است.' });
    return;
  }

  const phone = normalizeIranPhone(parsed.data.phone);
  const code = toAsciiDigits(parsed.data.code).trim();
  if (!phone || !/^\d{5}$/.test(code)) {
    res.status(400).json({ error: 'شماره موبایل یا کد تأیید ۵ رقمی معتبر نیست.' });
    return;
  }

  const db = getDb();
  const now = new Date();
  const nowStr = now.toISOString();

  const otpRow = db
    .prepare(`
      SELECT id, code_hash, expires_at, attempts, used_at
      FROM otp_codes
      WHERE phone = ? AND used_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `)
    .get(phone) as
    | { id: string; code_hash: string; expires_at: string; attempts: number; used_at: string | null }
    | undefined;

  if (!otpRow || otpRow.expires_at <= nowStr) {
    res.status(400).json({ error: 'کد تأیید منقضی شده یا وجود ندارد. لطفاً کد جدید دریافت کنید.' });
    return;
  }

  if (otpRow.attempts >= 5) {
    db.prepare(`UPDATE otp_codes SET used_at = ? WHERE id = ?`).run(nowStr, otpRow.id);
    res.status(429).json({ error: 'تعداد دفعات ورود کد اشتباه به حداکثر رسید. لطفاً کد جدید درخواست کنید.' });
    return;
  }

  const expectedHash = hashSecret(`otp:${phone}:${code}`);
  if (!safeEqual(otpRow.code_hash, expectedHash)) {
    db.prepare(`UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?`).run(otpRow.id);
    res.status(400).json({ error: 'کد تأیید واردشده نادرست است.' });
    return;
  }

  // Mark OTP as consumed
  db.prepare(`UPDATE otp_codes SET used_at = ? WHERE id = ?`).run(nowStr, otpRow.id);

  // Find or create user
  let userRow = db
    .prepare(`SELECT id, phone, display_name, notifications_enabled, is_suspended FROM users WHERE phone = ?`)
    .get(phone) as
    | {
        id: string;
        phone: string;
        display_name: string;
        notifications_enabled: number;
        is_suspended: number;
      }
    | undefined;

  let isNewUser = false;
  if (!userRow) {
    isNewUser = true;
    const userId = generateId();
    const defaultName = parsed.data.displayName || 'شهروند تهرانی';
    db.prepare(`
      INSERT INTO users (id, phone, display_name, notifications_enabled, is_demo, is_suspended, created_at, updated_at)
      VALUES (?, ?, ?, 0, 0, 0, ?, ?)
    `).run(userId, phone, defaultName, nowStr, nowStr);
    userRow = {
      id: userId,
      phone,
      display_name: defaultName,
      notifications_enabled: 0,
      is_suspended: 0,
    };
  } else if (userRow.is_suspended) {
    res.status(403).json({ error: 'حساب کاربری شما به دلیل نقض قوانین مسدود شده است.' });
    return;
  }

  // Issue session token
  const rawToken = generateSessionToken();
  const tokenHash = hashSecret(rawToken);
  const expiresAt = addDaysIso(now, CONFIG.SESSION_TTL_DAYS);

  db.prepare(`
    INSERT INTO sessions (token_hash, user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `).run(tokenHash, userRow.id, expiresAt, nowStr);

  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.cookie(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: isHttps,
    sameSite: isHttps ? 'none' : 'lax',
    partitioned: isHttps,
    maxAge: CONFIG.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
    path: '/',
  });

  const unreadNotifications = (
    db
      .prepare(`SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = ? AND is_read = 0`)
      .get(userRow.id) as { cnt: number }
  ).cnt;
  const myAdsCount = (
    db
      .prepare(`SELECT COUNT(*) AS cnt FROM found_items WHERE finder_id = ? AND status != 'removed'`)
      .get(userRow.id) as { cnt: number }
  ).cnt;
  const myAlertsCount = (
    db
      .prepare(`SELECT COUNT(*) AS cnt FROM lost_alerts WHERE user_id = ? AND status = 'active'`)
      .get(userRow.id) as { cnt: number }
  ).cnt;
  const incomingRequestsCount = (
    db
      .prepare(`SELECT COUNT(*) AS cnt FROM ownership_claims WHERE finder_id = ?`)
      .get(userRow.id) as { cnt: number }
  ).cnt;
  const myRequestsCount = (
    db
      .prepare(`SELECT COUNT(*) AS cnt FROM ownership_claims WHERE loser_id = ?`)
      .get(userRow.id) as { cnt: number }
  ).cnt;

  res.json({
    ok: true,
    isNewUser,
    token: rawToken,
    user: {
      id: userRow.id,
      phoneMasked: maskPhoneForSelf(userRow.phone),
      displayName: userRow.display_name,
      notificationsEnabled: Boolean(userRow.notifications_enabled),
    },
    counts: {
      unreadNotifications,
      myAds: myAdsCount,
      myActiveAlerts: myAlertsCount,
      incomingRequests: incomingRequestsCount,
      myRequests: myRequestsCount,
    },
  });
});

authRouter.get('/me', requireAuth, (req, res) => {
  runLifecycleSweep();
  const db = getDb();
  const userId = req.user!.id;

  const unreadNotifications = (
    db
      .prepare(`SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = ? AND is_read = 0`)
      .get(userId) as { cnt: number }
  ).cnt;

  const myAdsCount = (
    db
      .prepare(`SELECT COUNT(*) AS cnt FROM found_items WHERE finder_id = ? AND status != 'removed'`)
      .get(userId) as { cnt: number }
  ).cnt;

  const myAlertsCount = (
    db
      .prepare(`SELECT COUNT(*) AS cnt FROM lost_alerts WHERE user_id = ? AND status = 'active'`)
      .get(userId) as { cnt: number }
  ).cnt;

  const incomingRequestsCount = (
    db
      .prepare(`SELECT COUNT(*) AS cnt FROM ownership_claims WHERE finder_id = ?`)
      .get(userId) as { cnt: number }
  ).cnt;

  const myRequestsCount = (
    db
      .prepare(`SELECT COUNT(*) AS cnt FROM ownership_claims WHERE loser_id = ?`)
      .get(userId) as { cnt: number }
  ).cnt;

  res.json({
    user: {
      id: req.user!.id,
      phoneMasked: maskPhoneForSelf(req.user!.phone),
      displayName: req.user!.displayName,
      notificationsEnabled: req.user!.notificationsEnabled,
    },
    counts: {
      unreadNotifications,
      myAds: myAdsCount,
      myActiveAlerts: myAlertsCount,
      incomingRequests: incomingRequestsCount,
      myRequests: myRequestsCount,
    },
  });
});

const updateProfileSchema = z.object({
  displayName: z.string().trim().min(2, 'نام باید حداقل ۲ حرف باشد').max(60).optional(),
  notificationsEnabled: z.boolean().optional(),
});

authRouter.patch('/profile', requireAuth, (req, res) => {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'اطلاعات نامعتبر است.' });
    return;
  }

  const db = getDb();
  const userId = req.user!.id;
  const nowStr = nowIso();

  if (parsed.data.displayName !== undefined) {
    db.prepare(`UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?`).run(
      parsed.data.displayName,
      nowStr,
      userId
    );
  }
  if (parsed.data.notificationsEnabled !== undefined) {
    db.prepare(`UPDATE users SET notifications_enabled = ?, updated_at = ? WHERE id = ?`).run(
      parsed.data.notificationsEnabled ? 1 : 0,
      nowStr,
      userId
    );
  }

  const updated = db
    .prepare(`SELECT id, phone, display_name, notifications_enabled FROM users WHERE id = ?`)
    .get(userId) as {
    id: string;
    phone: string;
    display_name: string;
    notifications_enabled: number;
  };

  res.json({
    ok: true,
    user: {
      id: updated.id,
      phoneMasked: maskPhoneForSelf(updated.phone),
      displayName: updated.display_name,
      notificationsEnabled: Boolean(updated.notifications_enabled),
    },
  });
});

authRouter.post('/logout', requireAuth, (req, res) => {
  const db = getDb();
  if (req.sessionTokenHash) {
    db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(req.sessionTokenHash);
  }
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});
