import { Router } from 'express';
import { z } from 'zod';
import { getDb, nowIso } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { createNotification } from '../services/notificationService.js';
import { generateId } from '../utils/crypto.js';
import { containsPhoneNumber } from '../utils/persian.js';
import { createRateLimiter } from '../utils/rateLimit.js';

export const chatRouter = Router();

const chatLimiter = createRateLimiter({
  keyPrefix: 'chat-msg',
  windowMs: 60 * 1000,
  max: 25,
  keyFn: (req) => req.user?.id || req.ip || 'anon',
  message: 'تعداد پیام‌های ارسالی بیش از حد مجاز است. لطفاً کمی صبر کنید.',
});

function verifyClaimParticipant(claimId: string, userId: string) {
  const db = getDb();
  const claim = db
    .prepare(`
      SELECT c.id, c.item_id, c.loser_id, c.finder_id, c.status, fi.title AS item_title
      FROM ownership_claims c
      JOIN found_items fi ON fi.id = c.item_id
      WHERE c.id = ?
    `)
    .get(claimId) as
    | {
        id: string;
        item_id: string;
        loser_id: string;
        finder_id: string;
        status: string;
        item_title: string;
      }
    | undefined;

  if (!claim) return { error: 'پرونده یافت نشد.', status: 404 as const };
  if (claim.finder_id !== userId && claim.loser_id !== userId) {
    return { error: 'شما مجاز به مشاهده این گفت‌وگو نیستید.', status: 403 as const };
  }
  if (claim.status !== 'verified') {
    return { error: 'گفت‌وگو فقط پس از تأیید مالکیت فعال می‌شود.', status: 403 as const };
  }
  return { claim };
}

chatRouter.get('/:claimId/messages', requireAuth, (req, res) => {
  const claimId = String(req.params.claimId);
  const check = verifyClaimParticipant(claimId, req.user!.id);
  if ('error' in check) {
    res.status(check.status ?? 403).json({ error: check.error });
    return;
  }

  const db = getDb();
  const nowStr = nowIso();

  // Mark peer's messages as read
  db.prepare(`
    UPDATE chat_messages
    SET read_at = ?
    WHERE claim_id = ? AND sender_id != ? AND read_at IS NULL
  `).run(nowStr, claimId, req.user!.id);

  const rows = db
    .prepare(`
      SELECT m.id, m.sender_id, u.display_name AS sender_name, m.body, m.is_system, m.read_at, m.created_at
      FROM chat_messages m
      JOIN users u ON u.id = m.sender_id
      WHERE m.claim_id = ?
      ORDER BY m.created_at ASC
    `)
    .all(claimId) as {
    id: string;
    sender_id: string;
    sender_name: string;
    body: string;
    is_system: number;
    read_at: string | null;
    created_at: string;
  }[];

  res.json({
    messages: rows.map((m) => ({
      id: m.id,
      isMine: !m.is_system && m.sender_id === req.user!.id,
      isSystem: Boolean(m.is_system),
      senderName: m.is_system ? 'سامانه چی‌کجا' : m.sender_name,
      body: m.body,
      readAt: m.read_at,
      createdAt: m.created_at,
    })),
  });
});

const sendMessageSchema = z.object({
  body: z.string().trim().min(1, 'متن پیام نمی‌تواند خالی باشد').max(1000, 'پیام بسیار طولانی است'),
});

chatRouter.post('/:claimId/messages', requireAuth, chatLimiter, (req, res) => {
  const claimId = String(req.params.claimId);
  const check = verifyClaimParticipant(claimId, req.user!.id);
  if ('error' in check) {
    res.status(check.status ?? 403).json({ error: check.error });
    return;
  }

  const { claim } = check;
  const userId = req.user!.id;
  const peerId = claim.finder_id === userId ? claim.loser_id : claim.finder_id;

  const db = getDb();
  const blocked = db
    .prepare(`
      SELECT 1 FROM user_blocks
      WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)
    `)
    .get(userId, peerId, peerId, userId);

  if (blocked) {
    res.status(403).json({ error: 'به دلیل مسدودسازی، امکان ارسال پیام در این گفت‌وگو وجود ندارد.' });
    return;
  }

  const parsed = sendMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'پیام نامعتبر است.' });
    return;
  }

  // Enforce privacy rule: block sending phone numbers inside chat
  if (containsPhoneNumber(parsed.data.body)) {
    res.status(400).json({
      error:
        'برای حفظ امنیت و حریم خصوصی، ارسال شماره تلفن در گفت‌وگو مجاز نیست. لطفاً هماهنگی‌ها را فقط در همین گفت‌وگو انجام دهید.',
    });
    return;
  }

  const msgId = generateId();
  const nowStr = nowIso();
  db.prepare(`
    INSERT INTO chat_messages (id, claim_id, sender_id, body, is_system, created_at)
    VALUES (?, ?, ?, ?, 0, ?)
  `).run(msgId, claim.id, userId, parsed.data.body, nowStr);

  // Notify peer
  const senderIsFinder = userId === claim.finder_id;
  createNotification({
    userId: peerId,
    type: senderIsFinder ? 'finder_replied' : 'new_message',
    title: senderIsFinder ? 'دریافت پاسخ از یابنده' : 'پیام جدید در گفت‌وگو',
    body: `پیام جدید درباره «${claim.item_title}»: ${parsed.data.body.slice(0, 70)}`,
    linkPath: `/claims/${claim.id}`,
    metadata: { claimId: claim.id },
  });

  res.status(201).json({
    ok: true,
    message: {
      id: msgId,
      isMine: true,
      isSystem: false,
      senderName: req.user!.displayName,
      body: parsed.data.body,
      readAt: null,
      createdAt: nowStr,
    },
  });
});
