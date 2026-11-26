import { Router } from 'express';
import { z } from 'zod';
import { getDb, nowIso } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { logStatusChange } from '../services/auditService.js';
import { generateId } from '../utils/crypto.js';
import { createRateLimiter } from '../utils/rateLimit.js';

export const safetyRouter = Router();

const reportLimiter = createRateLimiter({
  keyPrefix: 'report',
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyFn: (req) => req.user?.id || req.ip || 'anon',
  message: 'تعداد گزارش‌های ارسالی بیش از حد مجاز است.',
});

const reportSchema = z.object({
  itemId: z.string().min(1),
  reason: z.enum([
    'fake_ad',
    'extortion',
    'privacy_violation',
    'unsafe_delivery',
    'other',
  ]),
  details: z.string().trim().max(400).optional().default(''),
});

safetyRouter.post('/report', requireAuth, reportLimiter, (req, res) => {
  const parsed = reportSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'دلیل گزارش معتبر نیست.' });
    return;
  }

  const db = getDb();
  const item = db
    .prepare(`SELECT id, finder_id, status FROM found_items WHERE id = ?`)
    .get(parsed.data.itemId) as { id: string; finder_id: string; status: string } | undefined;

  if (!item) {
    res.status(404).json({ error: 'آگهی موردنظر یافت نشد.' });
    return;
  }
  if (item.finder_id === req.user!.id) {
    res.status(400).json({ error: 'امکان گزارش آگهی خودتان وجود ندارد.' });
    return;
  }

  const duplicate = db
    .prepare(`SELECT id FROM reports WHERE reporter_id = ? AND item_id = ?`)
    .get(req.user!.id, item.id);
  if (duplicate) {
    res.status(400).json({ error: 'شما قبلاً این آگهی را گزارش کرده‌اید.' });
    return;
  }

  const nowStr = nowIso();
  db.prepare(`
    INSERT INTO reports (id, reporter_id, item_id, reported_user_id, reason, details, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'open', ?)
  `).run(
    generateId(),
    req.user!.id,
    item.id,
    item.finder_id,
    parsed.data.reason,
    parsed.data.details,
    nowStr
  );

  // Auto-remove suspicious ad if >= 3 unique users report it
  const reportCount = (
    db.prepare(`SELECT COUNT(DISTINCT reporter_id) AS cnt FROM reports WHERE item_id = ?`).get(item.id) as {
      cnt: number;
    }
  ).cnt;

  if (reportCount >= 3 && item.status === 'active') {
    db.prepare(`UPDATE found_items SET status = 'removed', updated_at = ? WHERE id = ?`).run(nowStr, item.id);
    logStatusChange({
      entityType: 'item',
      entityId: item.id,
      actorRole: 'system',
      fromStatus: 'active',
      toStatus: 'removed',
      note: 'حذف خودکار آگهی به دلیل دریافت ۳ گزارش تخلف',
    });
  }

  res.status(201).json({
    ok: true,
    message: 'گزارش شما ثبت شد و توسط تیم امنیت پیداش بررسی می‌شود.',
  });
});

const blockSchema = z.object({
  claimId: z.string().min(1).optional(),
  itemId: z.string().min(1).optional(),
  reason: z.string().trim().max(200).optional().default(''),
});

safetyRouter.post('/block', requireAuth, (req, res) => {
  const parsed = blockSchema.safeParse(req.body);
  if (!parsed.success || (!parsed.data.claimId && !parsed.data.itemId)) {
    res.status(400).json({ error: 'اطلاعات مسدودسازی ناقص است.' });
    return;
  }

  const db = getDb();
  const userId = req.user!.id;
  let targetUserId: string | null = null;

  if (parsed.data.claimId) {
    const claim = db
      .prepare(`SELECT finder_id, loser_id FROM ownership_claims WHERE id = ?`)
      .get(parsed.data.claimId) as { finder_id: string; loser_id: string } | undefined;
    if (!claim || (claim.finder_id !== userId && claim.loser_id !== userId)) {
      res.status(404).json({ error: 'پرونده موردنظر یافت نشد.' });
      return;
    }
    targetUserId = claim.finder_id === userId ? claim.loser_id : claim.finder_id;
  } else if (parsed.data.itemId) {
    const item = db
      .prepare(`SELECT finder_id FROM found_items WHERE id = ?`)
      .get(parsed.data.itemId) as { finder_id: string } | undefined;
    if (!item) {
      res.status(404).json({ error: 'آگهی موردنظر یافت نشد.' });
      return;
    }
    targetUserId = item.finder_id;
  }

  if (!targetUserId || targetUserId === userId) {
    res.status(400).json({ error: 'امکان مسدودسازی خودتان وجود ندارد.' });
    return;
  }

  db.prepare(`
    INSERT OR IGNORE INTO user_blocks (id, blocker_id, blocked_id, reason, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(generateId(), userId, targetUserId, parsed.data.reason, nowIso());

  res.status(201).json({
    ok: true,
    message: 'کاربر موردنظر مسدود شد و دیگر امکان ارتباط با شما را نخواهد داشت.',
  });
});

safetyRouter.get('/blocks', requireAuth, (req, res) => {
  const db = getDb();
  const rows = db
    .prepare(`
      SELECT b.blocked_id AS id, u.display_name AS displayName, b.reason, b.created_at AS createdAt
      FROM user_blocks b
      JOIN users u ON u.id = b.blocked_id
      WHERE b.blocker_id = ?
      ORDER BY b.created_at DESC
    `)
    .all(req.user!.id);

  res.json({ blocks: rows });
});

safetyRouter.delete('/blocks/:blockedId', requireAuth, (req, res) => {
  const db = getDb();
  db.prepare(`DELETE FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?`).run(
    req.user!.id,
    String(req.params.blockedId)
  );
  res.json({ ok: true });
});
