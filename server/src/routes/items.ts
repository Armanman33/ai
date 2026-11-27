import path from 'node:path';
import fs from 'node:fs';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import {
  CATEGORY_MAP,
  CONFIG,
  ItemCategory,
  SAFE_POINT_ONLY_CATEGORIES,
  STORAGE_DIR,
} from '../config.js';
import { addDaysIso, getDb, nowIso } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { getAuditLogs, logStatusChange } from '../services/auditService.js';
import { runLifecycleSweep } from '../services/lifecycleService.js';
import { notifyMatchingAlertsForFoundItem } from '../services/matchingService.js';
import {
  decryptText,
  encryptText,
  generateId,
  signImageUrl,
  verifyImageSignature,
} from '../utils/crypto.js';
import {
  coarsenCoordinate,
  haversineDistanceMeters,
  isInsideTehran,
} from '../utils/geo.js';
import { deleteItemImageFiles, processAndStoreItemImage } from '../utils/imageBlur.js';
import { normalizePersianText } from '../utils/persian.js';
import { createRateLimiter } from '../utils/rateLimit.js';

export const itemsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('فقط فرمت‌های تصویر JPG، PNG و WebP مجاز هستند.'));
    }
  },
});

const createItemLimiter = createRateLimiter({
  keyPrefix: 'create-item',
  windowMs: 15 * 60 * 1000,
  max: 12,
  keyFn: (req) => req.user?.id || req.ip || 'anon',
  message: 'تعداد ثبت آگهی در بازه کوتاه بیش از حد مجاز است. لطفاً کمی بعد تلاش کنید.',
});

const searchItemsLimiter = createRateLimiter({
  keyPrefix: 'search-items',
  windowMs: 60 * 1000,
  max: 120,
  message: 'تعداد درخواست‌های جست‌وجو بیش از حد مجاز است. لطفاً لحظاتی صبر کنید.',
});

interface FoundItemRow {
  id: string;
  finder_id: string;
  finder_name: string;
  title: string;
  category: ItemCategory;
  description: string;
  area_name: string;
  lat: number;
  lng: number;
  found_at: string;
  image_path: string;
  blurred_image_path: string;
  delivery_method: 'courier' | 'safe_point';
  safe_point_id: string | null;
  safe_point_name: string | null;
  safe_point_area: string | null;
  status: string;
  expires_at: string;
  relist_count: number;
  is_demo: number;
  created_at: string;
}

function isTimeSlotMatch(foundAtIso: string, lostDate: string | undefined, timeSlot: string | undefined): boolean {
  if (!lostDate && (!timeSlot || timeSlot === 'all_day')) return true;

  const foundDate = new Date(foundAtIso);
  if (Number.isNaN(foundDate.getTime())) return true;

  if (lostDate) {
    // Allow generous window around lostDate: items found from lostDate - 12h up to +4 days
    const target = new Date(`${lostDate}T00:00:00.000Z`);
    if (!Number.isNaN(target.getTime())) {
      const diffHours = (foundDate.getTime() - target.getTime()) / (1000 * 60 * 60);
      if (diffHours < -24 || diffHours > 120) return false;
    }
  }

  if (timeSlot && timeSlot !== 'all_day') {
    // Iran Standard Time is UTC+3:30
    const tehranHour = (foundDate.getUTCHours() + 3.5) % 24;
    if (timeSlot === 'morning' && !(tehranHour >= 5 && tehranHour < 12.5)) return false;
    if (timeSlot === 'noon' && !(tehranHour >= 11.5 && tehranHour < 16)) return false;
    if (timeSlot === 'evening' && !(tehranHour >= 15 && tehranHour < 20)) return false;
    if (timeSlot === 'night' && !(tehranHour >= 19 || tehranHour < 6)) return false;
  }

  return true;
}

/**
 * Public/Authenticated search of active found items in Tehran.
 * Never reveals finder phone, exact unverified coordinates, secret answers, or unblurred photos.
 */
itemsRouter.get('/search', searchItemsLimiter, (req, res) => {
  runLifecycleSweep();
  const db = getDb();
  const viewerId = req.user?.id || null;

  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
  const lat = req.query.lat !== undefined ? Number(req.query.lat) : null;
  const lng = req.query.lng !== undefined ? Number(req.query.lng) : null;
  const radiusMeters = req.query.radiusMeters !== undefined ? Number(req.query.radiusMeters) : 3000;
  const lostDate = typeof req.query.lostDate === 'string' ? req.query.lostDate.trim() : undefined;
  const timeSlot = typeof req.query.timeSlot === 'string' ? req.query.timeSlot.trim() : undefined;

  if (lat !== null && lng !== null && (!Number.isFinite(lat) || !Number.isFinite(lng) || !isInsideTehran(lat, lng))) {
    res.status(400).json({ error: 'چی‌کجا در حال حاضر فقط در محدوده شهر تهران فعال است.' });
    return;
  }

  const nowStr = nowIso();
  const params: (string | number)[] = [nowStr];
  let sql = `
    SELECT
      fi.id, fi.finder_id, u.display_name AS finder_name,
      fi.title, fi.category, fi.description, fi.area_name,
      fi.lat, fi.lng, fi.found_at, fi.image_path, fi.blurred_image_path,
      fi.delivery_method, fi.safe_point_id,
      sp.name AS safe_point_name, sp.area AS safe_point_area,
      fi.status, fi.expires_at, fi.relist_count, fi.is_demo, fi.created_at
    FROM found_items fi
    JOIN users u ON u.id = fi.finder_id
    LEFT JOIN safe_points sp ON sp.id = fi.safe_point_id
    WHERE fi.status = 'active' AND fi.expires_at > ? AND u.is_suspended = 0
  `;

  if (category && CATEGORY_MAP.has(category as ItemCategory)) {
    sql += ` AND fi.category = ?`;
    params.push(category);
  }

  if (viewerId) {
    sql += `
      AND NOT EXISTS (
        SELECT 1 FROM user_blocks b
        WHERE (b.blocker_id = ? AND b.blocked_id = fi.finder_id)
           OR (b.blocker_id = fi.finder_id AND b.blocked_id = ?)
      )
    `;
    params.push(viewerId, viewerId);
  }

  sql += ` ORDER BY fi.created_at DESC LIMIT 100`;

  const rows = db.prepare(sql).all(...params) as unknown as FoundItemRow[];

  // Fetch viewer's attempt states and verified claims in batch
  const attemptMap = new Map<string, { failed: number; blocked: boolean }>();
  const verifiedClaimMap = new Map<string, string>();
  if (viewerId) {
    const attRows = db
      .prepare(`SELECT item_id, failed_attempts, permanently_blocked FROM ownership_attempts WHERE user_id = ?`)
      .all(viewerId) as { item_id: string; failed_attempts: number; permanently_blocked: number }[];
    for (const a of attRows) {
      attemptMap.set(a.item_id, { failed: a.failed_attempts, blocked: Boolean(a.permanently_blocked) });
    }
    const verRows = db
      .prepare(`SELECT id, item_id FROM ownership_claims WHERE loser_id = ? AND status = 'verified'`)
      .all(viewerId) as { id: string; item_id: string }[];
    for (const v of verRows) {
      verifiedClaimMap.set(v.item_id, v.id);
    }
  }

  const normalizedQuery = q ? normalizePersianText(q) : '';
  const queryTokens = normalizedQuery ? normalizedQuery.split(' ').filter(Boolean) : [];

  const results = [];
  for (const row of rows) {
    // Location filter
    let distanceMeters: number | null = null;
    if (lat !== null && lng !== null) {
      distanceMeters = haversineDistanceMeters(lat, lng, row.lat, row.lng);
      const clampedRadius = Math.min(Math.max(radiusMeters || 2000, 300), 30000);
      if (distanceMeters > clampedRadius) continue;
    }

    // Time filter
    if (!isTimeSlotMatch(row.found_at, lostDate, timeSlot)) continue;

    // Keyword filter
    if (queryTokens.length > 0) {
      const catLabel = CATEGORY_MAP.get(row.category)?.label || '';
      const haystack = normalizePersianText(`${row.title} ${row.area_name} ${catLabel}`);
      const matched = queryTokens.some((tok) => haystack.includes(tok));
      if (!matched) continue;
    }

    const isFinder = viewerId === row.finder_id;
    const verifiedClaimId = verifiedClaimMap.get(row.id) || null;
    const canSeeFull = isFinder || Boolean(verifiedClaimId);
    const attemptState = attemptMap.get(row.id) || { failed: 0, blocked: false };
    const catMeta = CATEGORY_MAP.get(row.category);

    results.push({
      id: row.id,
      title: row.title,
      category: row.category,
      categoryLabel: catMeta?.label || row.category,
      isSensitive: Boolean(catMeta?.sensitive),
      areaName: row.area_name,
      // Coarsen coordinates for privacy until verified
      lat: canSeeFull ? row.lat : coarsenCoordinate(row.lat),
      lng: canSeeFull ? row.lng : coarsenCoordinate(row.lng),
      distanceMeters,
      foundAt: row.found_at,
      deliveryMethod: row.delivery_method,
      safePointName: row.safe_point_name,
      status: row.status,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      isDemo: Boolean(row.is_demo),
      imageUrl: signImageUrl(row.id, canSeeFull ? 'full' : 'blurred'),
      imageIsBlurred: !canSeeFull,
      isMine: isFinder,
      verifiedClaimId,
      permanentlyBlocked: attemptState.blocked,
      remainingAttempts: Math.max(0, CONFIG.MAX_WRONG_OWNERSHIP_ATTEMPTS - attemptState.failed),
    });
  }

  if (lat !== null && lng !== null) {
    results.sort((a, b) => (a.distanceMeters ?? 999999) - (b.distanceMeters ?? 999999));
  }

  res.json({ items: results, total: results.length });
});

/**
 * Finder's own registered items (آگهی‌های ثبت‌شده من)
 */
itemsRouter.get('/mine', requireAuth, (req, res) => {
  runLifecycleSweep();
  const db = getDb();
  const userId = req.user!.id;

  const rows = db
    .prepare(`
      SELECT
        fi.id, fi.finder_id, u.display_name AS finder_name,
        fi.title, fi.category, fi.description, fi.area_name,
        fi.lat, fi.lng, fi.found_at, fi.image_path, fi.blurred_image_path,
        fi.delivery_method, fi.safe_point_id,
        sp.name AS safe_point_name, sp.area AS safe_point_area,
        fi.status, fi.expires_at, fi.relist_count, fi.is_demo, fi.created_at
      FROM found_items fi
      JOIN users u ON u.id = fi.finder_id
      LEFT JOIN safe_points sp ON sp.id = fi.safe_point_id
      WHERE fi.finder_id = ? AND fi.status != 'removed'
      ORDER BY fi.created_at DESC
    `)
    .all(userId) as unknown as FoundItemRow[];

  const items = rows.map((row) => {
    const claimStats = db
      .prepare(`
        SELECT
          COUNT(*) AS total_claims,
          SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END) AS verified_claims
        FROM ownership_claims
        WHERE item_id = ?
      `)
      .get(row.id) as { total_claims: number; verified_claims: number | null };

    const questions = db
      .prepare(`SELECT question_index, question_text FROM item_questions WHERE item_id = ? ORDER BY question_index ASC`)
      .all(row.id) as { question_index: number; question_text: string }[];

    const catMeta = CATEGORY_MAP.get(row.category);
    return {
      id: row.id,
      title: row.title,
      category: row.category,
      categoryLabel: catMeta?.label || row.category,
      isSensitive: Boolean(catMeta?.sensitive),
      areaName: row.area_name,
      lat: row.lat,
      lng: row.lng,
      foundAt: row.found_at,
      deliveryMethod: row.delivery_method,
      safePointId: row.safe_point_id,
      safePointName: row.safe_point_name,
      status: row.status,
      expiresAt: row.expires_at,
      relistCount: row.relist_count,
      createdAt: row.created_at,
      imageUrl: signImageUrl(row.id, 'full'),
      totalClaims: claimStats.total_claims || 0,
      verifiedClaims: claimStats.verified_claims || 0,
      questions: questions.map((q) => ({ index: q.question_index, text: q.question_text })),
      auditLogs: getAuditLogs('item', row.id),
    };
  });

  res.json({ items });
});

/**
 * Signed image streaming endpoint — enforces real server-side blurring before ownership verification
 */
itemsRouter.get('/:id/image', (req, res) => {
  const id = String(req.params.id);
  const mode = req.query.mode === 'full' ? 'full' : 'blurred';
  const exp = typeof req.query.exp === 'string' ? req.query.exp : '';
  const sig = typeof req.query.sig === 'string' ? req.query.sig : '';

  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');

  if (!verifyImageSignature(id, mode, exp, sig)) {
    res.status(403).json({ ok: false, error: 'دسترسی غیرمجاز به تصویر.', code: 'FORBIDDEN_IMAGE' });
    return;
  }

  const db = getDb();
  const row = db
    .prepare(`SELECT image_path, blurred_image_path FROM found_items WHERE id = ? AND status != 'removed'`)
    .get(id) as { image_path: string; blurred_image_path: string } | undefined;

  if (!row) {
    res.status(404).json({ ok: false, error: 'تصویر یافت نشد.', code: 'IMAGE_NOT_FOUND' });
    return;
  }

  const relPath = mode === 'full' ? row.image_path : row.blurred_image_path;
  const resolvedStorageRoot = path.resolve(STORAGE_DIR);
  const absPath = path.resolve(resolvedStorageRoot, relPath);

  // Strict path traversal guard (using path.sep so /storage-evil never matches /storage)
  if (!absPath.startsWith(resolvedStorageRoot + path.sep) || !fs.existsSync(absPath)) {
    res.status(404).json({ ok: false, error: 'فایل تصویر یافت نشد.', code: 'IMAGE_FILE_MISSING' });
    return;
  }

  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Cache-Control', mode === 'full' ? 'private, no-store' : 'private, max-age=300');
  fs.createReadStream(absPath).pipe(res);
});

/**
 * Single item details with strict server-side access control & 3-strike lockout enforcement
 */
itemsRouter.get('/:id', (req, res) => {
  runLifecycleSweep();
  const db = getDb();
  const { id } = req.params;
  const viewerId = req.user?.id || null;

  const row = db
    .prepare(`
      SELECT
        fi.id, fi.finder_id, u.display_name AS finder_name,
        fi.title, fi.category, fi.description, fi.area_name,
        fi.lat, fi.lng, fi.found_at, fi.image_path, fi.blurred_image_path,
        fi.delivery_method, fi.safe_point_id,
        sp.name AS safe_point_name, sp.area AS safe_point_area,
        fi.status, fi.expires_at, fi.relist_count, fi.is_demo, fi.created_at
      FROM found_items fi
      JOIN users u ON u.id = fi.finder_id
      LEFT JOIN safe_points sp ON sp.id = fi.safe_point_id
      WHERE fi.id = ? AND fi.status != 'removed'
    `)
    .get(id) as FoundItemRow | undefined;

  if (!row) {
    res.status(404).json({ error: 'آگهی موردنظر یافت نشد.' });
    return;
  }

  // Enforce user-to-user block
  if (viewerId && viewerId !== row.finder_id) {
    const blocked = db
      .prepare(`
        SELECT 1 FROM user_blocks
        WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)
      `)
      .get(viewerId, row.finder_id, row.finder_id, viewerId);
    if (blocked) {
      res.status(403).json({ error: 'دسترسی به این آگهی امکان‌پذیر نیست.' });
      return;
    }
  }

  const isFinder = viewerId === row.finder_id;

  let failedAttempts = 0;
  let permanentlyBlocked = false;
  let verifiedClaimId: string | null = null;

  if (viewerId && !isFinder) {
    const att = db
      .prepare(`SELECT failed_attempts, permanently_blocked FROM ownership_attempts WHERE user_id = ? AND item_id = ?`)
      .get(viewerId, row.id) as { failed_attempts: number; permanently_blocked: number } | undefined;
    if (att) {
      failedAttempts = att.failed_attempts;
      permanentlyBlocked = Boolean(att.permanently_blocked);
    }

    const claim = db
      .prepare(`SELECT id FROM ownership_claims WHERE item_id = ? AND loser_id = ? AND status = 'verified' LIMIT 1`)
      .get(row.id, viewerId) as { id: string } | undefined;
    if (claim) {
      verifiedClaimId = claim.id;
    }
  }

  const canSeeFull = isFinder || Boolean(verifiedClaimId);
  const catMeta = CATEGORY_MAP.get(row.category);

  // Return ONLY question texts (NEVER secret answers to losers!)
  const questionRows = db
    .prepare(`SELECT question_index, question_text, answer_encrypted FROM item_questions WHERE item_id = ? ORDER BY question_index ASC`)
    .all(row.id) as { question_index: number; question_text: string; answer_encrypted: string }[];

  const questions = permanentlyBlocked && !isFinder
    ? []
    : questionRows.map((q) => ({
        index: q.question_index,
        text: q.question_text,
        // Finder can view their own reference answers; losers NEVER receive this field
        ...(isFinder ? { secretAnswer: decryptText(q.answer_encrypted) } : {}),
      }));

  res.json({
    item: {
      id: row.id,
      title: row.title,
      category: row.category,
      categoryLabel: catMeta?.label || row.category,
      isSensitive: Boolean(catMeta?.sensitive),
      safePointOnly: Boolean(catMeta?.safePointOnly),
      // Only show short non-sensitive description if verified or finder
      description: canSeeFull ? row.description : '',
      areaName: row.area_name,
      lat: canSeeFull ? row.lat : coarsenCoordinate(row.lat),
      lng: canSeeFull ? row.lng : coarsenCoordinate(row.lng),
      foundAt: row.found_at,
      deliveryMethod: row.delivery_method,
      safePointId: row.safe_point_id,
      safePointName: row.safe_point_name,
      status: row.status,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      isDemo: Boolean(row.is_demo),
      finderLabel: isFinder ? 'شما (یابنده)' : row.finder_name,
      imageUrl: signImageUrl(row.id, canSeeFull ? 'full' : 'blurred'),
      imageIsBlurred: !canSeeFull,
      isMine: isFinder,
      verifiedClaimId,
      failedAttempts,
      remainingAttempts: Math.max(0, CONFIG.MAX_WRONG_OWNERSHIP_ATTEMPTS - failedAttempts),
      permanentlyBlocked,
      questions,
    },
  });
});

const questionItemSchema = z.object({
  question: z.string().trim().min(4, 'متن هر پرسش باید حداقل ۴ حرف باشد').max(200),
  answer: z.string().trim().min(1, 'پاسخ محرمانه هر پرسش الزامی است').max(120),
});

const createItemSchema = z.object({
  title: z.string().trim().min(3, 'عنوان کوتاه شیء باید حداقل ۳ حرف باشد').max(100),
  category: z.enum([
    'electronics',
    'bag',
    'keys',
    'id_documents',
    'bank_cards',
    'jewelry_watch',
    'clothing',
    'other',
  ]),
  description: z.string().trim().max(400).optional().default(''),
  areaName: z.string().trim().min(2, 'نام محله یا محدوده تهران الزامی است').max(120),
  lat: z.coerce.number(),
  lng: z.coerce.number(),
  foundAt: z.string().min(10),
  deliveryMethod: z.enum(['courier', 'safe_point']),
  safePointId: z.string().trim().optional().nullable(),
  questions: z.array(questionItemSchema).length(3, 'طراحی دقیقاً ۳ پرسش محرمانه الزامی است.'),
});

/**
 * Create a new Found Item (مسیر یابنده)
 */
itemsRouter.post(
  '/',
  requireAuth,
  createItemLimiter,
  upload.single('photo'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'بارگذاری عکس شیء پیدا شده الزامی است.' });
        return;
      }

      let rawQuestions: unknown = req.body.questions;
      if (typeof rawQuestions === 'string') {
        try {
          rawQuestions = JSON.parse(rawQuestions);
        } catch {
          res.status(400).json({ error: 'فرمت پرسش‌های محرمانه معتبر نیست.' });
          return;
        }
      }

      const parsed = createItemSchema.safeParse({
        ...req.body,
        questions: rawQuestions,
      });

      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message || 'اطلاعات فرم ناقص یا نامعتبر است.' });
        return;
      }

      const data = parsed.data;

      // Strict Tehran geo enforcement
      if (!isInsideTehran(data.lat, data.lng)) {
        res.status(400).json({ error: 'موقعیت انتخاب‌شده خارج از محدوده شهر تهران است.' });
        return;
      }

      // Strict delivery rule: ID documents & bank cards MUST use Safe Point only
      if (SAFE_POINT_ONLY_CATEGORIES.has(data.category) && data.deliveryMethod !== 'safe_point') {
        res.status(400).json({
          error: 'برای مدارک شناسایی و کارت‌های بانکی، تحویل فقط از طریق نقطه امن مجاز است.',
        });
        return;
      }

      const db = getDb();
      let validatedSafePointId: string | null = null;
      if (data.deliveryMethod === 'safe_point') {
        if (!data.safePointId) {
          res.status(400).json({ error: 'لطفاً یک نقطه امن در تهران انتخاب کنید.' });
          return;
        }
        const sp = db
          .prepare(`SELECT id FROM safe_points WHERE id = ? AND is_active = 1`)
          .get(data.safePointId);
        if (!sp) {
          res.status(400).json({ error: 'نقطه امن انتخاب‌شده معتبر نیست.' });
          return;
        }
        validatedSafePointId = data.safePointId;
      }

      const foundDate = new Date(data.foundAt);
      if (Number.isNaN(foundDate.getTime()) || foundDate.getTime() > Date.now() + 10 * 60 * 1000) {
        res.status(400).json({ error: 'زمان پیدا شدن معتبر نیست.' });
        return;
      }

      const catMeta = CATEGORY_MAP.get(data.category)!;
      const processedImg = await processAndStoreItemImage(req.file.buffer, catMeta.sensitive);

      const itemId = generateId();
      const now = new Date();
      const nowStr = now.toISOString();
      const expiresAt = addDaysIso(now, CONFIG.FOUND_ITEM_TTL_DAYS);

      try {
        db.prepare(`
          INSERT INTO found_items (
            id, finder_id, title, category, description, area_name, lat, lng, found_at,
            image_path, blurred_image_path, delivery_method, safe_point_id,
            status, expires_at, near_expiry_notified, relist_count, is_demo, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, 0, 0, 0, ?, ?)
        `).run(
          itemId,
          req.user!.id,
          data.title,
          data.category,
          data.description,
          data.areaName,
          data.lat,
          data.lng,
          foundDate.toISOString(),
          processedImg.imagePath,
          processedImg.blurredImagePath,
          data.deliveryMethod,
          validatedSafePointId,
          expiresAt,
          nowStr,
          nowStr
        );

        const qStmt = db.prepare(`
          INSERT INTO item_questions (id, item_id, question_index, question_text, answer_encrypted, answer_normalized)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        data.questions.forEach((q, idx) => {
          qStmt.run(
            generateId(),
            itemId,
            idx + 1,
            q.question,
            encryptText(q.answer),
            normalizePersianText(q.answer)
          );
        });
      } catch (dbErr) {
        // Prevent orphaned image files if DB insert fails after image processing
        deleteItemImageFiles(processedImg.imagePath, processedImg.blurredImagePath);
        throw dbErr;
      }

      logStatusChange({
        entityType: 'item',
        entityId: itemId,
        actorId: req.user!.id,
        actorRole: 'finder',
        fromStatus: null,
        toStatus: 'active',
        note: 'ثبت شیء پیدا شده با اعتبار ۳ روزه',
      });

      // Immediately match active Lost Alerts in Tehran and notify matching losers
      const matchedAlerts = notifyMatchingAlertsForFoundItem({
        id: itemId,
        finderId: req.user!.id,
        title: data.title,
        category: data.category,
        areaName: data.areaName,
        lat: data.lat,
        lng: data.lng,
      });

      res.status(201).json({
        ok: true,
        itemId,
        expiresAt,
        matchedAlerts,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Re-list an expired found item for another 3 days
 */
itemsRouter.post('/:id/relist', requireAuth, (req, res) => {
  runLifecycleSweep();
  const db = getDb();
  const id = String(req.params.id);

  const row = db
    .prepare(`SELECT id, finder_id, title, category, area_name, lat, lng, status FROM found_items WHERE id = ?`)
    .get(id) as
    | {
        id: string;
        finder_id: string;
        title: string;
        category: string;
        area_name: string;
        lat: number;
        lng: number;
        status: string;
      }
    | undefined;

  if (!row) {
    res.status(404).json({ error: 'آگهی یافت نشد.' });
    return;
  }
  if (row.finder_id !== req.user!.id) {
    res.status(403).json({ error: 'شما مجاز به ثبت مجدد این آگهی نیستید.' });
    return;
  }
  if (row.status !== 'expired') {
    res.status(400).json({ error: 'فقط آگهی‌های منقضی‌شده قابل ثبت مجدد هستند.' });
    return;
  }

  const now = new Date();
  const nowStr = now.toISOString();
  const expiresAt = addDaysIso(now, CONFIG.FOUND_ITEM_TTL_DAYS);

  db.prepare(`
    UPDATE found_items
    SET status = 'active', expires_at = ?, near_expiry_notified = 0, relist_count = relist_count + 1, updated_at = ?
    WHERE id = ?
  `).run(expiresAt, nowStr, id);

  logStatusChange({
    entityType: 'item',
    entityId: id,
    actorId: req.user!.id,
    actorRole: 'finder',
    fromStatus: 'expired',
    toStatus: 'active',
    note: 'ثبت مجدد آگهی برای دوره ۳ روزه جدید',
  });

  notifyMatchingAlertsForFoundItem({
    id: row.id,
    finderId: row.finder_id,
    title: row.title,
    category: row.category,
    areaName: row.area_name,
    lat: row.lat,
    lng: row.lng,
  });

  res.json({ ok: true, status: 'active', expiresAt });
});

itemsRouter.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const id = String(req.params.id);

  const row = db
    .prepare(`SELECT id, finder_id, status, image_path, blurred_image_path, is_demo FROM found_items WHERE id = ?`)
    .get(id) as
    | {
        id: string;
        finder_id: string;
        status: string;
        image_path: string;
        blurred_image_path: string;
        is_demo: number;
      }
    | undefined;

  if (!row) {
    res.status(404).json({ error: 'آگهی یافت نشد.' });
    return;
  }
  if (row.finder_id !== req.user!.id) {
    res.status(403).json({ error: 'شما مجاز به حذف این آگهی نیستید.' });
    return;
  }
  if (row.status === 'claimed' || row.status === 'delivered') {
    res.status(400).json({ error: 'آگهی در حال تحویل یا تحویل‌شده قابل حذف نیست.' });
    return;
  }

  db.prepare(`UPDATE found_items SET status = 'removed', updated_at = ? WHERE id = ?`).run(nowIso(), id);

  // Free disk space immediately by removing uploaded + blurred images (never touching demo assets)
  if (!row.is_demo) {
    const stillReferenced = db
      .prepare(
        `SELECT 1 FROM found_items WHERE id != ? AND status != 'removed' AND (image_path = ? OR blurred_image_path = ?) LIMIT 1`
      )
      .get(id, row.image_path, row.blurred_image_path);
    if (!stillReferenced) {
      deleteItemImageFiles(row.image_path, row.blurred_image_path);
    }
  }

  logStatusChange({
    entityType: 'item',
    entityId: id,
    actorId: req.user!.id,
    actorRole: 'finder',
    fromStatus: row.status,
    toStatus: 'removed',
    note: 'حذف آگهی توسط یابنده و آزادسازی فایل‌های تصویر',
  });

  res.json({ ok: true });
});
