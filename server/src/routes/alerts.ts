import { Router } from 'express';
import { z } from 'zod';
import { CATEGORY_MAP, CONFIG, ItemCategory } from '../config.js';
import { addDaysIso, getDb, nowIso } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { logStatusChange } from '../services/auditService.js';
import { runLifecycleSweep } from '../services/lifecycleService.js';
import { generateId, signImageUrl } from '../utils/crypto.js';
import { haversineDistanceMeters, isInsideTehran } from '../utils/geo.js';
import { createRateLimiter } from '../utils/rateLimit.js';

export const alertsRouter = Router();

const createAlertLimiter = createRateLimiter({
  keyPrefix: 'create-alert',
  windowMs: 15 * 60 * 1000,
  max: 15,
  keyFn: (req) => req.user?.id || req.ip || 'anon',
  message: 'تعداد ثبت هشدار در بازه کوتاه بیش از حد مجاز است.',
});

interface AlertRow {
  id: string;
  user_id: string;
  title: string;
  category: ItemCategory;
  area_name: string;
  lat: number;
  lng: number;
  radius_meters: number;
  lost_date: string;
  time_slot: string;
  status: string;
  expires_at: string;
  relist_count: number;
  created_at: string;
}

alertsRouter.get('/mine', requireAuth, (req, res) => {
  runLifecycleSweep();
  const db = getDb();
  const userId = req.user!.id;
  const nowStr = nowIso();

  const rows = db
    .prepare(`
      SELECT id, user_id, title, category, area_name, lat, lng, radius_meters,
             lost_date, time_slot, status, expires_at, relist_count, created_at
      FROM lost_alerts
      WHERE user_id = ?
      ORDER BY created_at DESC
    `)
    .all(userId) as unknown as AlertRow[];

  const activeItems = db
    .prepare(`
      SELECT id, finder_id, title, category, area_name, lat, lng, found_at
      FROM found_items
      WHERE status = 'active' AND expires_at > ? AND finder_id != ?
        AND NOT EXISTS (
          SELECT 1 FROM user_blocks b
          WHERE (b.blocker_id = ? AND b.blocked_id = found_items.finder_id)
             OR (b.blocker_id = found_items.finder_id AND b.blocked_id = ?)
        )
    `)
    .all(nowStr, userId, userId, userId) as {
    id: string;
    finder_id: string;
    title: string;
    category: ItemCategory;
    area_name: string;
    lat: number;
    lng: number;
    found_at: string;
  }[];

  const alerts = rows.map((row) => {
    const matches = activeItems
      .filter((it) => {
        if (it.category !== row.category && row.category !== 'other') return false;
        const dist = haversineDistanceMeters(row.lat, row.lng, it.lat, it.lng);
        return dist <= row.radius_meters + 1000;
      })
      .slice(0, 5)
      .map((it) => ({
        id: it.id,
        title: it.title,
        areaName: it.area_name,
        foundAt: it.found_at,
        imageUrl: signImageUrl(it.id, 'blurred'),
      }));

    const catMeta = CATEGORY_MAP.get(row.category);
    return {
      id: row.id,
      title: row.title,
      category: row.category,
      categoryLabel: catMeta?.label || row.category,
      areaName: row.area_name,
      lat: row.lat,
      lng: row.lng,
      radiusMeters: row.radius_meters,
      lostDate: row.lost_date,
      timeSlot: row.time_slot,
      status: row.status,
      expiresAt: row.expires_at,
      relistCount: row.relist_count,
      createdAt: row.created_at,
      matchingItems: matches,
    };
  });

  res.json({ alerts });
});

const createAlertSchema = z.object({
  title: z.string().trim().min(2, 'عنوان شیء گمشده الزامی است').max(100),
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
  areaName: z.string().trim().min(2, 'محدوده تهران را انتخاب کنید').max(120),
  lat: z.coerce.number(),
  lng: z.coerce.number(),
  radiusMeters: z.coerce.number().int().min(300).max(15000).default(2000),
  lostDate: z.string().trim().min(8).max(20),
  timeSlot: z.enum(['morning', 'noon', 'evening', 'night', 'all_day']).default('all_day'),
});

alertsRouter.post('/', requireAuth, createAlertLimiter, (req, res) => {
  const parsed = createAlertSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'اطلاعات هشدار نامعتبر است.' });
    return;
  }

  const data = parsed.data;
  if (!isInsideTehran(data.lat, data.lng)) {
    res.status(400).json({ error: 'ثبت هشدار فقط برای محدوده شهر تهران امکان‌پذیر است.' });
    return;
  }

  const db = getDb();
  const activeCount = (
    db
      .prepare(`SELECT COUNT(*) AS cnt FROM lost_alerts WHERE user_id = ? AND status = 'active'`)
      .get(req.user!.id) as { cnt: number }
  ).cnt;

  if (activeCount >= 10) {
    res.status(400).json({ error: 'حداکثر ۱۰ هشدار فعال هم‌زمان مجاز است.' });
    return;
  }

  const id = generateId();
  const now = new Date();
  const nowStr = now.toISOString();
  const expiresAt = addDaysIso(now, CONFIG.LOST_ALERT_TTL_DAYS);

  db.prepare(`
    INSERT INTO lost_alerts (
      id, user_id, title, category, area_name, lat, lng, radius_meters,
      lost_date, time_slot, status, expires_at, near_expiry_notified, relist_count, is_demo, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, 0, 0, 0, ?, ?)
  `).run(
    id,
    req.user!.id,
    data.title,
    data.category,
    data.areaName,
    data.lat,
    data.lng,
    data.radiusMeters,
    data.lostDate,
    data.timeSlot,
    expiresAt,
    nowStr,
    nowStr
  );

  logStatusChange({
    entityType: 'alert',
    entityId: id,
    actorId: req.user!.id,
    actorRole: 'loser',
    fromStatus: null,
    toStatus: 'active',
    note: 'ثبت هشدار گم‌شدن با اعتبار ۵ روزه',
  });

  res.status(201).json({ ok: true, alertId: id, expiresAt });
});

alertsRouter.post('/:id/relist', requireAuth, (req, res) => {
  runLifecycleSweep();
  const db = getDb();
  const id = String(req.params.id);

  const row = db
    .prepare(`SELECT id, user_id, status FROM lost_alerts WHERE id = ?`)
    .get(id) as { id: string; user_id: string; status: string } | undefined;

  if (!row) {
    res.status(404).json({ error: 'هشدار یافت نشد.' });
    return;
  }
  if (row.user_id !== req.user!.id) {
    res.status(403).json({ error: 'شما مجاز به تمدید این هشدار نیستید.' });
    return;
  }
  if (row.status !== 'expired') {
    res.status(400).json({ error: 'فقط هشدارهای منقضی‌شده قابل ثبت مجدد هستند.' });
    return;
  }

  const now = new Date();
  const nowStr = now.toISOString();
  const expiresAt = addDaysIso(now, CONFIG.LOST_ALERT_TTL_DAYS);

  db.prepare(`
    UPDATE lost_alerts
    SET status = 'active', expires_at = ?, near_expiry_notified = 0, relist_count = relist_count + 1, updated_at = ?
    WHERE id = ?
  `).run(expiresAt, nowStr, id);

  logStatusChange({
    entityType: 'alert',
    entityId: id,
    actorId: req.user!.id,
    actorRole: 'loser',
    fromStatus: 'expired',
    toStatus: 'active',
    note: 'ثبت مجدد هشدار برای دوره ۵ روزه جدید',
  });

  res.json({ ok: true, status: 'active', expiresAt });
});

alertsRouter.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const id = String(req.params.id);

  const row = db
    .prepare(`SELECT id, user_id FROM lost_alerts WHERE id = ?`)
    .get(id) as { id: string; user_id: string } | undefined;

  if (!row) {
    res.status(404).json({ error: 'هشدار یافت نشد.' });
    return;
  }
  if (row.user_id !== req.user!.id) {
    res.status(403).json({ error: 'دسترسی غیرمجاز.' });
    return;
  }

  db.prepare(`DELETE FROM lost_alerts WHERE id = ?`).run(id);
  res.json({ ok: true });
});
