import { Router } from 'express';
import { z } from 'zod';
import { CATEGORY_MAP, CONFIG, ItemCategory } from '../config.js';
import { getDb, nowIso, runInTransaction } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { sendFinderClaimAlertSms } from '../providers/sms.js';
import { getAuditLogs, logStatusChange } from '../services/auditService.js';
import { runLifecycleSweep } from '../services/lifecycleService.js';
import { createNotification } from '../services/notificationService.js';
import {
  decryptText,
  encryptText,
  generateId,
  generateOneTimeDeliveryCode,
  hashSecret,
  signImageUrl,
} from '../utils/crypto.js';
import { doesAnswerMatch } from '../utils/persian.js';
import { createRateLimiter } from '../utils/rateLimit.js';

export const claimsRouter = Router();

const claimSubmitLimiter = createRateLimiter({
  keyPrefix: 'claim-submit',
  windowMs: 5 * 60 * 1000,
  max: 15,
  keyFn: (req) => req.user?.id || req.ip || 'anon',
  message: 'تعداد درخواست‌های احراز مالکیت بیش از حد مجاز است. لطفاً کمی بعد تلاش کنید.',
});

const submitClaimSchema = z.object({
  itemId: z.string().min(1),
  answers: z
    .array(z.string().trim().min(1, 'پاسخ به هر سه پرسش الزامی است').max(200))
    .length(3, 'باید دقیقاً به هر ۳ پرسش پاسخ دهید.'),
});

function initializeVerifiedClaim(params: {
  claimId: string;
  itemId: string;
  loserId: string;
  finderId: string;
  itemTitle: string;
  deliveryMethod: 'courier' | 'safe_point';
  safePointId: string | null;
  verifiedBy: 'auto' | 'finder';
  actorId: string;
  actorRole: 'finder' | 'loser' | 'system';
}): string {
  const db = getDb();
  const nowStr = nowIso();

  // Mark claim verified
  db.prepare(`
    UPDATE ownership_claims
    SET status = 'verified', verified_at = ?, verified_by = ?, updated_at = ?
    WHERE id = ?
  `).run(nowStr, params.verifiedBy, nowStr, params.claimId);

  // Mark item as claimed so other claimants cannot claim it concurrently
  db.prepare(`
    UPDATE found_items SET status = 'claimed', updated_at = ? WHERE id = ?
  `).run(nowStr, params.itemId);

  logStatusChange({
    entityType: 'item',
    entityId: params.itemId,
    actorId: params.actorId,
    actorRole: params.actorRole,
    fromStatus: 'active',
    toStatus: 'claimed',
    note: params.verifiedBy === 'auto' ? 'تأیید خودکار مالکیت با پاسخ صحیح به ۳ پرسش' : 'تأیید مالکیت توسط یابنده',
  });

  logStatusChange({
    entityType: 'claim',
    entityId: params.claimId,
    actorId: params.actorId,
    actorRole: params.actorRole,
    fromStatus: 'pending_review',
    toStatus: 'verified',
    note: 'مالکیت متقاضی تأیید شد',
  });

  // Create Delivery record
  const deliveryId = generateId();
  let initialStatus: 'pending_coordination' | 'safe_point_selected' = 'pending_coordination';
  let handoverHash: string | null = null;
  let handoverEnc: string | null = null;

  if (params.deliveryMethod === 'safe_point' && params.safePointId) {
    initialStatus = 'safe_point_selected';
    const dropoffCode = generateOneTimeDeliveryCode();
    handoverHash = hashSecret(`handover:${deliveryId}:${dropoffCode}`);
    handoverEnc = encryptText(dropoffCode);
  }

  db.prepare(`
    INSERT INTO deliveries (
      id, claim_id, item_id, method, safe_point_id, status,
      handover_code_hash, handover_code_encrypted, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    deliveryId,
    params.claimId,
    params.itemId,
    params.deliveryMethod,
    params.safePointId,
    initialStatus,
    handoverHash,
    handoverEnc,
    nowStr,
    nowStr
  );

  logStatusChange({
    entityType: 'delivery',
    entityId: deliveryId,
    actorId: params.actorId,
    actorRole: params.actorRole,
    fromStatus: null,
    toStatus: initialStatus,
    note:
      params.deliveryMethod === 'safe_point'
        ? 'ایجاد پرونده تحویل از طریق نقطه امن'
        : 'ایجاد پرونده تحویل از طریق پیک',
  });

  // Add system safety message to internal chat
  db.prepare(`
    INSERT INTO chat_messages (id, claim_id, sender_id, body, is_system, created_at)
    VALUES (?, ?, ?, ?, 1, ?)
  `).run(
    generateId(),
    params.claimId,
    params.finderId,
    'مالکیت تأیید شد. گفت‌وگوی داخلی امن فعال است. برای حفظ امنیت، هرگز شماره تماس یا نشانی منزل خود را در پیام‌ها ارسال نکنید و مراحل تحویل را فقط از پنل تحویل همین صفحه دنبال کنید.',
    nowStr
  );

  // Notifications for both sides
  createNotification({
    userId: params.loserId,
    type: 'ownership_verified',
    title: 'مالکیت شما تأیید شد',
    body: `مالکیت شما برای «${params.itemTitle}» تأیید شد. اکنون می‌توانید در گفت‌وگوی داخلی با یابنده هماهنگ کنید.`,
    linkPath: `/claims/${params.claimId}`,
    metadata: { claimId: params.claimId, itemId: params.itemId },
  });

  createNotification({
    userId: params.finderId,
    type: 'claimant_verified',
    title: 'مالکیت متقاضی تأیید شد',
    body: `مالکیت متقاضی برای آگهی «${params.itemTitle}» تأیید شد. لطفاً وارد گفت‌وگوی داخلی و هماهنگی تحویل شوید.`,
    linkPath: `/claims/${params.claimId}`,
    metadata: { claimId: params.claimId, itemId: params.itemId },
  });

  return deliveryId;
}

/**
 * Submit 3 answers to prove ownership of a found item.
 * Server-side 3-strike permanent lockout per (user_id, item_id).
 */
claimsRouter.post('/', requireAuth, claimSubmitLimiter, async (req, res) => {
  runLifecycleSweep();
  const parsed = submitClaimSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'لطفاً به هر سه پرسش پاسخ دهید.' });
    return;
  }

  const { itemId, answers } = parsed.data;
  const loserId = req.user!.id;
  const nowStr = nowIso();

  type ClaimOutcome =
    | { status: number; body: Record<string, unknown>; sms?: { phone: string; title: string } };

  const outcome = runInTransaction<ClaimOutcome>((db) => {
    const item = db
      .prepare(`
        SELECT fi.id, fi.finder_id, fi.title, fi.category, fi.delivery_method, fi.safe_point_id, fi.status, u.phone AS finder_phone
        FROM found_items fi
        JOIN users u ON u.id = fi.finder_id
        WHERE fi.id = ?
      `)
      .get(itemId) as
      | {
          id: string;
          finder_id: string;
          title: string;
          category: ItemCategory;
          delivery_method: 'courier' | 'safe_point';
          safe_point_id: string | null;
          status: string;
          finder_phone: string;
        }
      | undefined;

    if (!item) {
      return { status: 404, body: { error: 'آگهی موردنظر یافت نشد.' } };
    }
    if (item.finder_id === loserId) {
      return { status: 400, body: { error: 'امکان ثبت درخواست مالکیت روی آگهی خودتان وجود ندارد.' } };
    }

    // Enforce user-to-user block
    const blocked = db
      .prepare(`
        SELECT 1 FROM user_blocks
        WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)
      `)
      .get(loserId, item.finder_id, item.finder_id, loserId);
    if (blocked) {
      return { status: 403, body: { error: 'امکان ارسال درخواست برای این آگهی وجود ندارد.' } };
    }

    // Check if user already verified on this item
    const existingVerified = db
      .prepare(`SELECT id FROM ownership_claims WHERE item_id = ? AND loser_id = ? AND status = 'verified' LIMIT 1`)
      .get(itemId, loserId) as { id: string } | undefined;
    if (existingVerified) {
      return { status: 200, body: { verified: true, claimId: existingVerified.id, alreadyVerified: true } };
    }

    // STRICT SERVER-SIDE 3-STRIKE LOCKOUT CHECK (atomic inside BEGIN IMMEDIATE transaction)
    const attemptRow = db
      .prepare(`SELECT id, failed_attempts, permanently_blocked FROM ownership_attempts WHERE user_id = ? AND item_id = ?`)
      .get(loserId, itemId) as
      | { id: string; failed_attempts: number; permanently_blocked: number }
      | undefined;

    if (attemptRow && (attemptRow.permanently_blocked === 1 || attemptRow.failed_attempts >= CONFIG.MAX_WRONG_OWNERSHIP_ATTEMPTS)) {
      return {
        status: 403,
        body: {
          error: 'دسترسی شما به این آگهی به دلیل ۳ بار پاسخ اشتباه برای همیشه بسته شده است.',
          permanentlyBlocked: true,
          failedAttempts: attemptRow.failed_attempts,
          remainingAttempts: 0,
        },
      };
    }

    if (item.status !== 'active') {
      return { status: 400, body: { error: 'این آگهی دیگر فعال نیست و امکان بررسی مالکیت برای آن وجود ندارد.' } };
    }

    const questions = db
      .prepare(`SELECT question_index, question_text, answer_normalized FROM item_questions WHERE item_id = ? ORDER BY question_index ASC`)
      .all(itemId) as { question_index: number; question_text: string; answer_normalized: string }[];

    if (questions.length !== 3) {
      return { status: 500, body: { error: 'پرسش‌های امنیتی این آگهی کامل نیست.' } };
    }

    const allCorrect = questions.every((q, idx) => doesAnswerMatch(answers[idx], q.answer_normalized));
    const currentAttemptNum = (attemptRow?.failed_attempts || 0) + 1;

    const claimId = generateId();
    db.prepare(`
      INSERT INTO ownership_claims (
        id, item_id, loser_id, finder_id, status, answers_json, attempt_number, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      claimId,
      itemId,
      loserId,
      item.finder_id,
      allCorrect ? 'verified' : 'rejected',
      JSON.stringify(answers),
      currentAttemptNum,
      nowStr,
      nowStr
    );

    createNotification({
      userId: item.finder_id,
      type: 'claim_received',
      title: 'دریافت درخواست جدید روی آگهی شما',
      body: `یک کاربر برای اثبات مالکیت «${item.title}» به ۳ پرسش محرمانه پاسخ داد.`,
      linkPath: '/requests',
      metadata: { claimId, itemId },
    });

    if (allCorrect) {
      const deliveryId = initializeVerifiedClaim({
        claimId,
        itemId,
        loserId,
        finderId: item.finder_id,
        itemTitle: item.title,
        deliveryMethod: item.delivery_method,
        safePointId: item.safe_point_id,
        verifiedBy: 'auto',
        actorId: loserId,
        actorRole: 'loser',
      });

      return {
        status: 200,
        body: {
          verified: true,
          claimId,
          deliveryId,
          message: 'مالکیت شما با موفقیت تأیید شد! اکنون می‌توانید گفت‌وگو و هماهنگی تحویل را آغاز کنید.',
        },
        sms: { phone: item.finder_phone, title: item.title },
      };
    }

    // Incorrect attempt -> atomically persist strike in ownership_attempts
    const newFailedAttempts = (attemptRow?.failed_attempts || 0) + 1;
    const isNowBlocked = newFailedAttempts >= CONFIG.MAX_WRONG_OWNERSHIP_ATTEMPTS ? 1 : 0;

    if (attemptRow) {
      db.prepare(`
        UPDATE ownership_attempts
        SET failed_attempts = ?, permanently_blocked = ?, last_attempt_at = ?
        WHERE id = ?
      `).run(newFailedAttempts, isNowBlocked, nowStr, attemptRow.id);
    } else {
      db.prepare(`
        INSERT INTO ownership_attempts (id, user_id, item_id, failed_attempts, permanently_blocked, last_attempt_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(generateId(), loserId, itemId, newFailedAttempts, isNowBlocked, nowStr, nowStr);
    }

    logStatusChange({
      entityType: 'claim',
      entityId: claimId,
      actorId: loserId,
      actorRole: 'loser',
      fromStatus: null,
      toStatus: 'rejected',
      note: `پاسخ نادرست (تلاش ${newFailedAttempts} از ${CONFIG.MAX_WRONG_OWNERSHIP_ATTEMPTS})`,
    });

    const remaining = Math.max(0, CONFIG.MAX_WRONG_OWNERSHIP_ATTEMPTS - newFailedAttempts);

    return {
      status: isNowBlocked ? 403 : 200,
      body: {
        verified: false,
        claimId,
        failedAttempts: newFailedAttempts,
        remainingAttempts: remaining,
        permanentlyBlocked: Boolean(isNowBlocked),
        message: isNowBlocked
          ? 'به دلیل ۳ بار پاسخ اشتباه، دسترسی شما به این آگهی برای همیشه بسته شد. سایر آگهی‌ها همچنان قابل استفاده هستند.'
          : `پاسخ‌های واردشده با مشخصات ثبت‌شده مطابقت نداشت. شما ${remaining} فرصت دیگر دارید.`,
      },
      sms: { phone: item.finder_phone, title: item.title },
    };
  });

  // Dispatch SMS outside SQLite write lock
  if (outcome.sms) {
    await sendFinderClaimAlertSms(outcome.sms.phone, outcome.sms.title);
  }

  res.status(outcome.status).json(outcome.body);
});

/**
 * Incoming requests for finder (درخواست‌های دریافتی)
 */
claimsRouter.get('/incoming', requireAuth, (req, res) => {
  const db = getDb();
  const userId = req.user!.id;

  const rows = db
    .prepare(`
      SELECT
        c.id, c.item_id, c.loser_id, c.status, c.answers_json, c.attempt_number,
        c.verified_at, c.verified_by, c.finder_note, c.created_at,
        u.display_name AS loser_name,
        fi.title AS item_title, fi.category AS item_category, fi.area_name AS item_area, fi.status AS item_status,
        d.status AS delivery_status, d.method AS delivery_method
      FROM ownership_claims c
      JOIN users u ON u.id = c.loser_id
      JOIN found_items fi ON fi.id = c.item_id
      LEFT JOIN deliveries d ON d.claim_id = c.id
      WHERE c.finder_id = ?
      ORDER BY c.created_at DESC
    `)
    .all(userId) as {
    id: string;
    item_id: string;
    loser_id: string;
    status: string;
    answers_json: string;
    attempt_number: number;
    verified_at: string | null;
    verified_by: string | null;
    finder_note: string | null;
    created_at: string;
    loser_name: string;
    item_title: string;
    item_category: ItemCategory;
    item_area: string;
    item_status: string;
    delivery_status: string | null;
    delivery_method: string | null;
  }[];

  const requests = rows.map((r) => {
    const questions = db
      .prepare(`SELECT question_index, question_text, answer_encrypted FROM item_questions WHERE item_id = ? ORDER BY question_index ASC`)
      .all(r.item_id) as { question_index: number; question_text: string; answer_encrypted: string }[];

    const unreadChat = (
      db
        .prepare(`SELECT COUNT(*) AS cnt FROM chat_messages WHERE claim_id = ? AND sender_id != ? AND read_at IS NULL AND is_system = 0`)
        .get(r.id, userId) as { cnt: number }
    ).cnt;

    let submittedAnswers: string[] = [];
    try {
      submittedAnswers = JSON.parse(r.answers_json);
    } catch {
      submittedAnswers = [];
    }

    return {
      id: r.id,
      itemId: r.item_id,
      itemTitle: r.item_title,
      itemCategoryLabel: CATEGORY_MAP.get(r.item_category)?.label || r.item_category,
      itemArea: r.item_area,
      itemStatus: r.item_status,
      itemImageUrl: signImageUrl(r.item_id, 'full'),
      claimantName: r.loser_name, // NEVER exposes phone number!
      status: r.status,
      attemptNumber: r.attempt_number,
      verifiedAt: r.verified_at,
      finderNote: r.finder_note,
      deliveryStatus: r.delivery_status,
      deliveryMethod: r.delivery_method,
      unreadMessages: unreadChat,
      createdAt: r.created_at,
      qaComparison: questions.map((q, idx) => ({
        index: q.question_index,
        question: q.question_text,
        expectedAnswer: decryptText(q.answer_encrypted),
        submittedAnswer: submittedAnswers[idx] || '',
      })),
    };
  });

  res.json({ requests });
});

/**
 * Loser's own submitted requests
 */
claimsRouter.get('/mine', requireAuth, (req, res) => {
  const db = getDb();
  const userId = req.user!.id;

  const rows = db
    .prepare(`
      SELECT
        c.id, c.item_id, c.status, c.attempt_number, c.verified_at, c.finder_note, c.created_at,
        u.display_name AS finder_name,
        fi.title AS item_title, fi.category AS item_category, fi.area_name AS item_area, fi.status AS item_status,
        d.status AS delivery_status, d.method AS delivery_method
      FROM ownership_claims c
      JOIN users u ON u.id = c.finder_id
      JOIN found_items fi ON fi.id = c.item_id
      LEFT JOIN deliveries d ON d.claim_id = c.id
      WHERE c.loser_id = ?
      ORDER BY c.created_at DESC
    `)
    .all(userId) as {
    id: string;
    item_id: string;
    status: string;
    attempt_number: number;
    verified_at: string | null;
    finder_note: string | null;
    created_at: string;
    finder_name: string;
    item_title: string;
    item_category: ItemCategory;
    item_area: string;
    item_status: string;
    delivery_status: string | null;
    delivery_method: string | null;
  }[];

  const requests = rows.map((r) => {
    const unreadChat = (
      db
        .prepare(`SELECT COUNT(*) AS cnt FROM chat_messages WHERE claim_id = ? AND sender_id != ? AND read_at IS NULL AND is_system = 0`)
        .get(r.id, userId) as { cnt: number }
    ).cnt;

    const isVerified = r.status === 'verified';
    return {
      id: r.id,
      itemId: r.item_id,
      itemTitle: r.item_title,
      itemCategoryLabel: CATEGORY_MAP.get(r.item_category)?.label || r.item_category,
      itemArea: r.item_area,
      itemStatus: r.item_status,
      itemImageUrl: signImageUrl(r.item_id, isVerified ? 'full' : 'blurred'),
      finderName: r.finder_name, // NEVER exposes phone number!
      status: r.status,
      attemptNumber: r.attempt_number,
      verifiedAt: r.verified_at,
      finderNote: r.finder_note,
      deliveryStatus: r.delivery_status,
      deliveryMethod: r.delivery_method,
      unreadMessages: unreadChat,
      createdAt: r.created_at,
    };
  });

  res.json({ requests });
});

/**
 * Finder manual decision on an incoming request (approve paraphrased answer or send response)
 */
const finderDecisionSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  note: z.string().trim().max(240).optional().default(''),
});

claimsRouter.post('/:id/finder-decision', requireAuth, (req, res) => {
  const parsed = finderDecisionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'تصمیم انتخاب‌شده معتبر نیست.' });
    return;
  }

  const id = String(req.params.id);
  const finderId = req.user!.id;

  const outcome = runInTransaction<{ status: number; body: Record<string, unknown> }>((db) => {
    const claim = db
      .prepare(`
        SELECT c.id, c.item_id, c.loser_id, c.finder_id, c.status,
               fi.title, fi.delivery_method, fi.safe_point_id, fi.status AS item_status
        FROM ownership_claims c
        JOIN found_items fi ON fi.id = c.item_id
        WHERE c.id = ?
      `)
      .get(id) as
      | {
          id: string;
          item_id: string;
          loser_id: string;
          finder_id: string;
          status: string;
          title: string;
          delivery_method: 'courier' | 'safe_point';
          safe_point_id: string | null;
          item_status: string;
        }
      | undefined;

    if (!claim) {
      return { status: 404, body: { error: 'درخواست یافت نشد.' } };
    }
    if (claim.finder_id !== finderId) {
      return { status: 403, body: { error: 'فقط یابنده این آگهی مجاز به تصمیم‌گیری است.' } };
    }
    if (claim.status === 'verified') {
      return { status: 400, body: { error: 'این درخواست قبلاً تأیید شده است.' } };
    }

    const blocked = db
      .prepare(`
        SELECT 1 FROM user_blocks
        WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)
      `)
      .get(finderId, claim.loser_id, claim.loser_id, finderId);
    if (blocked) {
      return { status: 403, body: { error: 'به دلیل مسدودسازی، امکان ادامه این درخواست وجود ندارد.' } };
    }

    const nowStr = nowIso();
    if (parsed.data.decision === 'approve') {
      if (claim.item_status !== 'active') {
        return { status: 400, body: { error: 'این آگهی دیگر در وضعیت فعال نیست.' } };
      }

      db.prepare(`UPDATE ownership_claims SET finder_note = ?, updated_at = ? WHERE id = ?`).run(
        parsed.data.note || null,
        nowStr,
        claim.id
      );

      const deliveryId = initializeVerifiedClaim({
        claimId: claim.id,
        itemId: claim.item_id,
        loserId: claim.loser_id,
        finderId: claim.finder_id,
        itemTitle: claim.title,
        deliveryMethod: claim.delivery_method,
        safePointId: claim.safe_point_id,
        verifiedBy: 'finder',
        actorId: finderId,
        actorRole: 'finder',
      });

      createNotification({
        userId: claim.loser_id,
        type: 'finder_replied',
        title: 'دریافت پاسخ از یابنده',
        body: parsed.data.note
          ? `یابنده «${claim.title}» پاسخ شما را بررسی و تأیید کرد: ${parsed.data.note}`
          : `یابنده «${claim.title}» درخواست مالکیت شما را تأیید کرد.`,
        linkPath: `/claims/${claim.id}`,
        metadata: { claimId: claim.id },
      });

      return { status: 200, body: { ok: true, status: 'verified', claimId: claim.id, deliveryId } };
    }

    // Reject with note
    db.prepare(`UPDATE ownership_claims SET status = 'rejected', finder_note = ?, updated_at = ? WHERE id = ?`).run(
      parsed.data.note || 'پاسخ‌ها با مشخصات شیء مطابقت نداشت.',
      nowStr,
      claim.id
    );

    createNotification({
      userId: claim.loser_id,
      type: 'finder_replied',
      title: 'دریافت پاسخ از یابنده',
      body: `یابنده درباره «${claim.title}» پاسخ داد: ${parsed.data.note || 'پاسخ‌های ارائه‌شده تأیید نشد.'}`,
      linkPath: `/items/${claim.item_id}`,
      metadata: { claimId: claim.id },
    });

    return { status: 200, body: { ok: true, status: 'rejected' } };
  });

  res.status(outcome.status).json(outcome.body);
});

/**
 * Verified claim room details (Chat + Delivery + Digital Receipt)
 * Strictly restricted to the verified loser and finder!
 */
claimsRouter.get('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const id = String(req.params.id);
  const userId = req.user!.id;

  const claim = db
    .prepare(`
      SELECT
        c.id, c.item_id, c.loser_id, c.finder_id, c.status, c.verified_at, c.verified_by, c.created_at,
        uf.display_name AS finder_name,
        ul.display_name AS loser_name,
        fi.title AS item_title, fi.category AS item_category, fi.description AS item_description,
        fi.area_name AS item_area, fi.found_at AS item_found_at, fi.status AS item_status
      FROM ownership_claims c
      JOIN users uf ON uf.id = c.finder_id
      JOIN users ul ON ul.id = c.loser_id
      JOIN found_items fi ON fi.id = c.item_id
      WHERE c.id = ?
    `)
    .get(id) as
    | {
        id: string;
        item_id: string;
        loser_id: string;
        finder_id: string;
        status: string;
        verified_at: string | null;
        verified_by: string | null;
        created_at: string;
        finder_name: string;
        loser_name: string;
        item_title: string;
        item_category: ItemCategory;
        item_description: string;
        item_area: string;
        item_found_at: string;
        item_status: string;
      }
    | undefined;

  if (!claim) {
    res.status(404).json({ error: 'پرونده موردنظر یافت نشد.' });
    return;
  }

  const isFinder = claim.finder_id === userId;
  const isLoser = claim.loser_id === userId;
  if (!isFinder && !isLoser) {
    res.status(403).json({ error: 'شما اجازه دسترسی به این پرونده را ندارید.' });
    return;
  }

  if (claim.status !== 'verified') {
    res.status(403).json({ error: 'گفت‌وگو و هماهنگی تحویل فقط پس از تأیید مالکیت در دسترس است.' });
    return;
  }

  const peerId = isFinder ? claim.loser_id : claim.finder_id;
  const isBlocked = Boolean(
    db
      .prepare(`
        SELECT 1 FROM user_blocks
        WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)
      `)
      .get(userId, peerId, peerId, userId)
  );

  const delivery = db
    .prepare(`
      SELECT d.*, sp.name AS sp_name, sp.area AS sp_area, sp.address AS sp_address, sp.hours AS sp_hours
      FROM deliveries d
      LEFT JOIN safe_points sp ON sp.id = d.safe_point_id
      WHERE d.claim_id = ?
    `)
    .get(claim.id) as
    | {
        id: string;
        claim_id: string;
        item_id: string;
        method: 'courier' | 'safe_point';
        safe_point_id: string | null;
        courier_destination_masked: string | null;
        status: string;
        handover_code_encrypted: string | null;
        handover_code_used_at: string | null;
        pickup_code_encrypted: string | null;
        pickup_code_used_at: string | null;
        safe_point_operator_name: string | null;
        safe_point_receipt_no: string | null;
        final_receipt_no: string | null;
        handed_over_at: string | null;
        delivered_at: string | null;
        created_at: string;
        updated_at: string;
        sp_name: string | null;
        sp_area: string | null;
        sp_address: string | null;
        sp_hours: string | null;
      }
    | undefined;

  const catMeta = CATEGORY_MAP.get(claim.item_category);

  // Role-gated one-time delivery codes:
  // - Finder sees handoverCode ONLY while handover is pending (courier_requested or safe_point_selected)
  // - Loser sees pickupCode ONLY while final receipt is pending (handed_to_courier or received_at_safe_point)
  let activeHandoverCodeForFinder: string | null = null;
  let activePickupCodeForLoser: string | null = null;

  if (delivery) {
    if (
      isFinder &&
      !delivery.handover_code_used_at &&
      delivery.handover_code_encrypted &&
      (delivery.status === 'courier_requested' || delivery.status === 'safe_point_selected')
    ) {
      activeHandoverCodeForFinder = decryptText(delivery.handover_code_encrypted);
    }
    if (
      isLoser &&
      !delivery.pickup_code_used_at &&
      delivery.pickup_code_encrypted &&
      (delivery.status === 'handed_to_courier' || delivery.status === 'received_at_safe_point')
    ) {
      activePickupCodeForLoser = decryptText(delivery.pickup_code_encrypted);
    }
  }

  res.json({
    claim: {
      id: claim.id,
      status: claim.status,
      verifiedAt: claim.verified_at,
      myRole: isFinder ? 'finder' : 'loser',
      peerName: isFinder ? claim.loser_name : claim.finder_name,
      isBlocked,
      item: {
        id: claim.item_id,
        title: claim.item_title,
        category: claim.item_category,
        categoryLabel: catMeta?.label || claim.item_category,
        safePointOnly: Boolean(catMeta?.safePointOnly),
        description: claim.item_description,
        areaName: claim.item_area,
        foundAt: claim.item_found_at,
        status: claim.item_status,
        imageUrl: signImageUrl(claim.item_id, 'full'),
      },
      delivery: delivery
        ? {
            id: delivery.id,
            method: delivery.method,
            status: delivery.status,
            safePoint: delivery.safe_point_id
              ? {
                  id: delivery.safe_point_id,
                  name: delivery.sp_name,
                  area: delivery.sp_area,
                  address: delivery.sp_address,
                  hours: delivery.sp_hours,
                }
              : null,
            // Home address NEVER exposed to finder — only masked notice!
            courierDestinationMasked: delivery.courier_destination_masked,
            activeHandoverCode: activeHandoverCodeForFinder,
            activePickupCode: activePickupCodeForLoser,
            safePointOperatorName: delivery.safe_point_operator_name,
            safePointReceiptNo: delivery.safe_point_receipt_no,
            finalReceiptNo: delivery.final_receipt_no,
            handedOverAt: delivery.handed_over_at,
            deliveredAt: delivery.delivered_at,
            auditLogs: getAuditLogs('delivery', delivery.id),
          }
        : null,
    },
  });
});
