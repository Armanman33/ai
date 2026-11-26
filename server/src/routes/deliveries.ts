import { Router } from 'express';
import { z } from 'zod';
import { ItemCategory, SAFE_POINT_ONLY_CATEGORIES } from '../config.js';
import { getDb, nowIso } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { logStatusChange } from '../services/auditService.js';
import { createNotification } from '../services/notificationService.js';
import {
  encryptText,
  generateId,
  generateOneTimeDeliveryCode,
  generateReceiptNumber,
  hashSecret,
  safeEqual,
} from '../utils/crypto.js';
import { toAsciiDigits } from '../utils/persian.js';

export const deliveriesRouter = Router();

interface DeliveryContext {
  deliveryId: string;
  claimId: string;
  itemId: string;
  itemTitle: string;
  itemCategory: ItemCategory;
  finderId: string;
  loserId: string;
  method: 'courier' | 'safe_point';
  safePointId: string | null;
  status: string;
  handoverCodeHash: string | null;
  handoverCodeUsedAt: string | null;
  pickupCodeHash: string | null;
  pickupCodeUsedAt: string | null;
}

function getDeliveryContext(claimId: string, userId: string): { ctx?: DeliveryContext; error?: string; status?: number } {
  const db = getDb();
  const row = db
    .prepare(`
      SELECT
        d.id AS deliveryId, d.claim_id AS claimId, d.item_id AS itemId,
        fi.title AS itemTitle, fi.category AS itemCategory,
        c.finder_id AS finderId, c.loser_id AS loserId, c.status AS claimStatus,
        d.method, d.safe_point_id AS safePointId, d.status,
        d.handover_code_hash AS handoverCodeHash, d.handover_code_used_at AS handoverCodeUsedAt,
        d.pickup_code_hash AS pickupCodeHash, d.pickup_code_used_at AS pickupCodeUsedAt
      FROM deliveries d
      JOIN ownership_claims c ON c.id = d.claim_id
      JOIN found_items fi ON fi.id = d.item_id
      WHERE d.claim_id = ?
    `)
    .get(claimId) as (DeliveryContext & { claimStatus: string }) | undefined;

  if (!row) return { error: 'پرونده تحویل یافت نشد.', status: 404 };
  if (row.finderId !== userId && row.loserId !== userId) {
    return { error: 'دسترسی غیرمجاز به پرونده تحویل.', status: 403 };
  }
  if (row.claimStatus !== 'verified') {
    return { error: 'تحویل فقط پس از تأیید مالکیت امکان‌پذیر است.', status: 403 };
  }
  return { ctx: row };
}

/**
 * Step A (Courier): Loser requests courier delivery & provides destination for authorized courier ONLY.
 * Home address is encrypted and NEVER exposed to the finder.
 */
const requestCourierSchema = z.object({
  destinationArea: z.string().trim().min(2, 'محله مقصد در تهران را وارد کنید').max(80),
  destinationAddress: z.string().trim().min(8, 'نشانی دقیق جهت تحویل به پیک مجاز الزامی است').max(300),
  acceptCourierFee: z.literal(true, {
    errorMap: () => ({ message: 'تأیید پرداخت هزینه پیک توسط گم‌کننده الزامی است.' }),
  }),
});

deliveriesRouter.post('/:claimId/request-courier', requireAuth, (req, res) => {
  const resCtx = getDeliveryContext(String(req.params.claimId), req.user!.id);
  if (!resCtx.ctx) {
    res.status(resCtx.status || 400).json({ error: resCtx.error });
    return;
  }
  const ctx = resCtx.ctx;

  // STRICT ROLE CHECK: Only verified loser can request courier
  if (ctx.loserId !== req.user!.id) {
    res.status(403).json({ error: 'فقط مالک تأییدشده می‌تواند درخواست ارسال با پیک ثبت کند.' });
    return;
  }

  // STRICT PRIVACY RULE: ID documents & bank cards cannot use courier!
  if (SAFE_POINT_ONLY_CATEGORIES.has(ctx.itemCategory)) {
    res.status(400).json({ error: 'برای مدارک شناسایی و کارت‌های بانکی، ارسال با پیک مجاز نیست و تحویل فقط از طریق نقطه امن انجام می‌شود.' });
    return;
  }

  if (ctx.status !== 'pending_coordination' && ctx.status !== 'safe_point_selected') {
    res.status(400).json({ error: 'در این مرحله امکان تغییر به ارسال با پیک وجود ندارد.' });
    return;
  }

  const parsed = requestCourierSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'اطلاعات ارسال با پیک ناقص است.' });
    return;
  }

  const db = getDb();
  const nowStr = nowIso();
  const handoverCode = generateOneTimeDeliveryCode();
  const handoverHash = hashSecret(`handover:${ctx.deliveryId}:${handoverCode}`);
  const handoverEnc = encryptText(handoverCode);

  const maskedSummary = `محدوده ${parsed.data.destinationArea} (نشانی دقیق محرمانه و صرفاً در اختیار پیک مجاز است)`;
  const encryptedAddress = encryptText(`${parsed.data.destinationArea} | ${parsed.data.destinationAddress}`);

  db.prepare(`
    UPDATE deliveries
    SET method = 'courier',
        safe_point_id = NULL,
        courier_destination_masked = ?,
        courier_destination_encrypted = ?,
        status = 'courier_requested',
        handover_code_hash = ?,
        handover_code_encrypted = ?,
        handover_code_used_at = NULL,
        updated_at = ?
    WHERE id = ?
  `).run(maskedSummary, encryptedAddress, handoverHash, handoverEnc, nowStr, ctx.deliveryId);

  logStatusChange({
    entityType: 'delivery',
    entityId: ctx.deliveryId,
    actorId: req.user!.id,
    actorRole: 'loser',
    fromStatus: ctx.status,
    toStatus: 'courier_requested',
    note: `ثبت درخواست ارسال با پیک (هزینه بر عهده گم‌کننده) — مقصد: محدوده ${parsed.data.destinationArea}`,
  });

  db.prepare(`
    INSERT INTO chat_messages (id, claim_id, sender_id, body, is_system, created_at)
    VALUES (?, ?, ?, ?, 1, ?)
  `).run(
    generateId(),
    ctx.claimId,
    ctx.loserId,
    `درخواست ارسال با پیک ثبت شد (محدوده ${parsed.data.destinationArea}). هزینه پیک بر عهده گم‌کننده است و نشانی منزل فقط در اختیار پیک مجاز قرار می‌گیرد. کد یک‌بارمصرف تحویل به پیک برای یابنده صادر شد.`,
    nowStr
  );

  createNotification({
    userId: ctx.finderId,
    type: 'courier_requested',
    title: 'درخواست ارسال با پیک ثبت شد',
    body: `مالک «${ctx.itemTitle}» درخواست ارسال با پیک ثبت کرد. کد تحویل یک‌بارمصرف شما آماده است.`,
    linkPath: `/claims/${ctx.claimId}`,
    metadata: { claimId: ctx.claimId },
  });

  createNotification({
    userId: ctx.loserId,
    type: 'delivery_status_changed',
    title: 'تغییر وضعیت تحویل',
    body: `درخواست ارسال با پیک برای «${ctx.itemTitle}» ثبت شد و در انتظار تحویل یابنده به پیک است.`,
    linkPath: `/claims/${ctx.claimId}`,
    metadata: { claimId: ctx.claimId },
  });

  res.json({ ok: true, status: 'courier_requested' });
});

/**
 * Step B (Courier): Finder confirms handing the item to the authorized courier using the one-time handover code
 */
const verifyCodeSchema = z.object({
  code: z.string().trim().min(6).max(8),
  operatorName: z.string().trim().min(2).max(80).optional(),
});

deliveriesRouter.post('/:claimId/confirm-courier-handover', requireAuth, (req, res) => {
  const resCtx = getDeliveryContext(String(req.params.claimId), req.user!.id);
  if (!resCtx.ctx) {
    res.status(resCtx.status || 400).json({ error: resCtx.error });
    return;
  }
  const ctx = resCtx.ctx;

  if (ctx.finderId !== req.user!.id) {
    res.status(403).json({ error: 'فقط یابنده می‌تواند تحویل شیء به پیک را تأیید کند.' });
    return;
  }
  if (ctx.method !== 'courier' || ctx.status !== 'courier_requested') {
    res.status(400).json({ error: 'پرونده در وضعیت انتظار تحویل به پیک نیست.' });
    return;
  }
  if (!ctx.handoverCodeHash || ctx.handoverCodeUsedAt) {
    res.status(400).json({ error: 'کد تحویل یک‌بارمصرف معتبر نیست یا قبلاً استفاده شده است.' });
    return;
  }

  const parsed = verifyCodeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'لطفاً کد تحویل ۶ رقمی یک‌بارمصرف را وارد کنید.' });
    return;
  }

  const submittedCode = toAsciiDigits(parsed.data.code);
  const expectedHash = hashSecret(`handover:${ctx.deliveryId}:${submittedCode}`);
  if (!safeEqual(ctx.handoverCodeHash, expectedHash)) {
    res.status(400).json({ error: 'کد تحویل یک‌بارمصرف واردشده نادرست است.' });
    return;
  }

  const db = getDb();
  const nowStr = nowIso();
  const pickupCode = generateOneTimeDeliveryCode();
  const pickupHash = hashSecret(`pickup:${ctx.deliveryId}:${pickupCode}`);
  const pickupEnc = encryptText(pickupCode);
  const dispatchReceipt = generateReceiptNumber('SP');

  db.prepare(`
    UPDATE deliveries
    SET status = 'handed_to_courier',
        handover_code_used_at = ?,
        handover_code_encrypted = NULL,
        pickup_code_hash = ?,
        pickup_code_encrypted = ?,
        safe_point_receipt_no = ?,
        handed_over_at = ?,
        updated_at = ?
    WHERE id = ?
  `).run(nowStr, pickupHash, pickupEnc, dispatchReceipt, nowStr, nowStr, ctx.deliveryId);

  logStatusChange({
    entityType: 'delivery',
    entityId: ctx.deliveryId,
    actorId: req.user!.id,
    actorRole: 'finder',
    fromStatus: 'courier_requested',
    toStatus: 'handed_to_courier',
    note: `تحویل شیء به پیک مجاز با کد یک‌بارمصرف تأیید شد (رسید: ${dispatchReceipt})`,
  });

  db.prepare(`
    INSERT INTO chat_messages (id, claim_id, sender_id, body, is_system, created_at)
    VALUES (?, ?, ?, ?, 1, ?)
  `).run(
    generateId(),
    ctx.claimId,
    ctx.finderId,
    `شیء با کد امن یک‌بارمصرف تحویل پیک شد (شماره رسید ارسال: ${dispatchReceipt}). کد یک‌بارمصرف تحویل نهایی برای مالک صادر شد.`,
    nowStr
  );

  createNotification({
    userId: ctx.loserId,
    type: 'delivery_status_changed',
    title: 'شیء تحویل پیک شد',
    body: `«${ctx.itemTitle}» تحویل پیک شد. پس از دریافت، کد تحویل یک‌بارمصرف خود را برای صدور رسید نهایی ثبت کنید.`,
    linkPath: `/claims/${ctx.claimId}`,
    metadata: { claimId: ctx.claimId },
  });

  res.json({ ok: true, status: 'handed_to_courier', receiptNo: dispatchReceipt });
});

/**
 * Step A (Safe Point): Select or change Tehran Safe Point before drop-off
 */
const selectSafePointSchema = z.object({
  safePointId: z.string().min(2),
});

deliveriesRouter.post('/:claimId/select-safe-point', requireAuth, (req, res) => {
  const resCtx = getDeliveryContext(String(req.params.claimId), req.user!.id);
  if (!resCtx.ctx) {
    res.status(resCtx.status || 400).json({ error: resCtx.error });
    return;
  }
  const ctx = resCtx.ctx;

  if (ctx.status !== 'pending_coordination' && ctx.status !== 'safe_point_selected') {
    res.status(400).json({ error: 'پس از تحویل شیء امکان تغییر نقطه امن وجود ندارد.' });
    return;
  }

  const parsed = selectSafePointSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'لطفاً یک نقطه امن معتبر در تهران انتخاب کنید.' });
    return;
  }

  const db = getDb();
  const sp = db
    .prepare(`SELECT id, name, area FROM safe_points WHERE id = ? AND is_active = 1`)
    .get(parsed.data.safePointId) as { id: string; name: string; area: string } | undefined;

  if (!sp) {
    res.status(400).json({ error: 'نقطه امن انتخاب‌شده معتبر نیست.' });
    return;
  }

  const nowStr = nowIso();
  const handoverCode = generateOneTimeDeliveryCode();
  const handoverHash = hashSecret(`handover:${ctx.deliveryId}:${handoverCode}`);
  const handoverEnc = encryptText(handoverCode);

  db.prepare(`
    UPDATE deliveries
    SET method = 'safe_point',
        safe_point_id = ?,
        status = 'safe_point_selected',
        handover_code_hash = ?,
        handover_code_encrypted = ?,
        handover_code_used_at = NULL,
        updated_at = ?
    WHERE id = ?
  `).run(sp.id, handoverHash, handoverEnc, nowStr, ctx.deliveryId);

  const actorRole = ctx.finderId === req.user!.id ? 'finder' : 'loser';
  logStatusChange({
    entityType: 'delivery',
    entityId: ctx.deliveryId,
    actorId: req.user!.id,
    actorRole,
    fromStatus: ctx.status,
    toStatus: 'safe_point_selected',
    note: `انتخاب نقطه امن: ${sp.name}`,
  });

  const peerId = actorRole === 'finder' ? ctx.loserId : ctx.finderId;
  createNotification({
    userId: peerId,
    type: 'delivery_status_changed',
    title: 'نقطه امن تحویل مشخص شد',
    body: `نقطه امن «${sp.name}» برای تحویل «${ctx.itemTitle}» انتخاب شد.`,
    linkPath: `/claims/${ctx.claimId}`,
    metadata: { claimId: ctx.claimId },
  });

  res.json({ ok: true, status: 'safe_point_selected', safePointName: sp.name });
});

/**
 * Step B (Safe Point): Safe Point intake confirmation (records operator receipt with one-time drop-off code)
 */
deliveriesRouter.post('/:claimId/confirm-safe-point-dropoff', requireAuth, (req, res) => {
  const resCtx = getDeliveryContext(String(req.params.claimId), req.user!.id);
  if (!resCtx.ctx) {
    res.status(resCtx.status || 400).json({ error: resCtx.error });
    return;
  }
  const ctx = resCtx.ctx;

  if (ctx.finderId !== req.user!.id) {
    res.status(403).json({ error: 'فقط یابنده می‌تواند ثبت تحویل شیء در نقطه امن را تکمیل کند.' });
    return;
  }
  if (ctx.method !== 'safe_point' || ctx.status !== 'safe_point_selected') {
    res.status(400).json({ error: 'پرونده در وضعیت انتظار تحویل به نقطه امن نیست.' });
    return;
  }
  if (!ctx.handoverCodeHash || ctx.handoverCodeUsedAt) {
    res.status(400).json({ error: 'کد تحویل یک‌بارمصرف معتبر نیست یا قبلاً استفاده شده است.' });
    return;
  }

  const parsed = verifyCodeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'کد یک‌بارمصرف ۶ رقمی و نام مسئول نقطه امن را وارد کنید.' });
    return;
  }

  const submittedCode = toAsciiDigits(parsed.data.code);
  const expectedHash = hashSecret(`handover:${ctx.deliveryId}:${submittedCode}`);
  if (!safeEqual(ctx.handoverCodeHash, expectedHash)) {
    res.status(400).json({ error: 'کد یک‌بارمصرف تحویل به نقطه امن نادرست است.' });
    return;
  }

  const db = getDb();
  const nowStr = nowIso();
  const operatorName = parsed.data.operatorName || 'مسئول باجه نقطه امن پیداش';
  const safePointReceipt = generateReceiptNumber('SP');
  const pickupCode = generateOneTimeDeliveryCode();
  const pickupHash = hashSecret(`pickup:${ctx.deliveryId}:${pickupCode}`);
  const pickupEnc = encryptText(pickupCode);

  db.prepare(`
    UPDATE deliveries
    SET status = 'received_at_safe_point',
        handover_code_used_at = ?,
        handover_code_encrypted = NULL,
        pickup_code_hash = ?,
        pickup_code_encrypted = ?,
        safe_point_operator_name = ?,
        safe_point_receipt_no = ?,
        handed_over_at = ?,
        updated_at = ?
    WHERE id = ?
  `).run(nowStr, pickupHash, pickupEnc, operatorName, safePointReceipt, nowStr, nowStr, ctx.deliveryId);

  logStatusChange({
    entityType: 'delivery',
    entityId: ctx.deliveryId,
    actorId: req.user!.id,
    actorRole: 'safe_point_operator',
    fromStatus: 'safe_point_selected',
    toStatus: 'received_at_safe_point',
    note: `دریافت شیء توسط ${operatorName} در نقطه امن ثبت شد (رسید: ${safePointReceipt})`,
  });

  db.prepare(`
    INSERT INTO chat_messages (id, claim_id, sender_id, body, is_system, created_at)
    VALUES (?, ?, ?, ?, 1, ?)
  `).run(
    generateId(),
    ctx.claimId,
    ctx.finderId,
    `دریافت شیء در نقطه امن توسط «${operatorName}» ثبت شد و رسید دیجیتال امانت (${safePointReceipt}) صادر گردید. مالک می‌تواند با کد تحویل یک‌بارمصرف خود برای دریافت مراجعه کند.`,
    nowStr
  );

  createNotification({
    userId: ctx.loserId,
    type: 'delivery_status_changed',
    title: 'شیء در نقطه امن آماده تحویل است',
    body: `«${ctx.itemTitle}» در نقطه امن ثبت شد (رسید: ${safePointReceipt}). با کد یک‌بارمصرف خود برای دریافت مراجعه کنید.`,
    linkPath: `/claims/${ctx.claimId}`,
    metadata: { claimId: ctx.claimId, receiptNo: safePointReceipt },
  });

  res.json({ ok: true, status: 'received_at_safe_point', safePointReceiptNo: safePointReceipt });
});

/**
 * Final Step (Courier OR Safe Point): Loser confirms final receipt using their cryptographic one-time pickup code.
 * Issues final immutable Digital Receipt visible to both parties.
 */
deliveriesRouter.post('/:claimId/confirm-delivery', requireAuth, (req, res) => {
  const resCtx = getDeliveryContext(String(req.params.claimId), req.user!.id);
  if (!resCtx.ctx) {
    res.status(resCtx.status || 400).json({ error: resCtx.error });
    return;
  }
  const ctx = resCtx.ctx;

  // STRICT SERVER AUTHORIZATION: Only the verified owner (loser) can confirm final receipt!
  if (ctx.loserId !== req.user!.id) {
    res.status(403).json({ error: 'فقط مالک تأییدشده می‌تواند دریافت نهایی شیء را با کد یک‌بارمصرف ثبت کند.' });
    return;
  }

  if (ctx.status !== 'handed_to_courier' && ctx.status !== 'received_at_safe_point') {
    res.status(400).json({ error: 'شیء هنوز به پیک یا نقطه امن تحویل داده نشده است.' });
    return;
  }

  if (!ctx.pickupCodeHash || ctx.pickupCodeUsedAt) {
    res.status(400).json({ error: 'کد تحویل نهایی معتبر نیست یا قبلاً مصرف شده است.' });
    return;
  }

  const parsed = verifyCodeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'لطفاً کد تحویل ۶ رقمی یک‌بارمصرف را وارد کنید.' });
    return;
  }

  const submittedCode = toAsciiDigits(parsed.data.code);
  const expectedHash = hashSecret(`pickup:${ctx.deliveryId}:${submittedCode}`);
  if (!safeEqual(ctx.pickupCodeHash, expectedHash)) {
    res.status(400).json({ error: 'کد تحویل یک‌بارمصرف نادرست است.' });
    return;
  }

  const db = getDb();
  const nowStr = nowIso();
  const finalReceiptNo = generateReceiptNumber('DL');

  db.prepare(`
    UPDATE deliveries
    SET status = 'delivered',
        pickup_code_used_at = ?,
        pickup_code_encrypted = NULL,
        final_receipt_no = ?,
        delivered_at = ?,
        updated_at = ?
    WHERE id = ?
  `).run(nowStr, finalReceiptNo, nowStr, nowStr, ctx.deliveryId);

  db.prepare(`UPDATE found_items SET status = 'delivered', updated_at = ? WHERE id = ?`).run(
    nowStr,
    ctx.itemId
  );

  logStatusChange({
    entityType: 'delivery',
    entityId: ctx.deliveryId,
    actorId: req.user!.id,
    actorRole: 'loser',
    fromStatus: ctx.status,
    toStatus: 'delivered',
    note: `تأیید دریافت نهایی شیء با کد یک‌بارمصرف و صدور رسید دیجیتال (${finalReceiptNo})`,
  });

  logStatusChange({
    entityType: 'item',
    entityId: ctx.itemId,
    actorId: req.user!.id,
    actorRole: 'loser',
    fromStatus: 'claimed',
    toStatus: 'delivered',
    note: `تحویل موفق شیء به مالک (رسید: ${finalReceiptNo})`,
  });

  db.prepare(`
    INSERT INTO chat_messages (id, claim_id, sender_id, body, is_system, created_at)
    VALUES (?, ?, ?, ?, 1, ?)
  `).run(
    generateId(),
    ctx.claimId,
    ctx.loserId,
    `تحویل نهایی شیء با کد امن یک‌بارمصرف تأیید شد. رسید دیجیتال نهایی (${finalReceiptNo}) برای هر دو طرف صادر گردید.`,
    nowStr
  );

  createNotification({
    userId: ctx.finderId,
    type: 'delivery_confirmed',
    title: 'تأیید دریافت شیء توسط مالک',
    body: `مالک دریافت «${ctx.itemTitle}» را تأیید کرد و رسید دیجیتال نهایی (${finalReceiptNo}) صادر شد. از امانت‌داری شما سپاسگزاریم!`,
    linkPath: `/claims/${ctx.claimId}`,
    metadata: { claimId: ctx.claimId, receiptNo: finalReceiptNo },
  });

  createNotification({
    userId: ctx.loserId,
    type: 'delivery_status_changed',
    title: 'رسید دیجیتال تحویل صادر شد',
    body: `تحویل «${ctx.itemTitle}» با موفقیت ثبت شد. شماره رسید دیجیتال: ${finalReceiptNo}`,
    linkPath: `/claims/${ctx.claimId}`,
    metadata: { claimId: ctx.claimId, receiptNo: finalReceiptNo },
  });

  res.json({ ok: true, status: 'delivered', finalReceiptNo });
});
