import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import sharp from 'sharp';

// Isolated temporary SQLite DB for tests (never pollutes production/dev DB)
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'peydash-test-'));
process.env.STORAGE_DIR = tmpDir;
process.env.DB_PATH = path.join(tmpDir, 'test.db');
process.env.SEED_DEMO_DATA = 'false';

let server: http.Server;
let baseUrl = '';

async function reqJson(
  method: string,
  route: string,
  opts: { token?: string; body?: unknown; formData?: FormData } = {}
) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  let body: BodyInit | undefined;
  if (opts.formData) {
    body = opts.formData;
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(`${baseUrl}${route}`, { method, headers, body });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json, res };
}

async function loginUser(phone: string, displayName: string): Promise<{ token: string; userId: string }> {
  const otpRes = await reqJson('POST', '/api/auth/request-otp', { body: { phone } });
  assert.equal(otpRes.status, 200, `OTP request failed: ${JSON.stringify(otpRes.json)}`);
  const code = String(otpRes.json.sandboxCode);
  assert.match(code, /^\d{5}$/);

  const verRes = await reqJson('POST', '/api/auth/verify-otp', {
    body: { phone, code, displayName },
  });
  assert.equal(verRes.status, 200, `OTP verify failed: ${JSON.stringify(verRes.json)}`);
  const token = String(verRes.json.token);
  const userObj = verRes.json.user as { id: string };
  return { token, userId: userObj.id };
}

async function makeSamplePhotoBlob(): Promise<Blob> {
  const buf = await sharp({
    create: { width: 320, height: 240, channels: 3, background: { r: 220, g: 180, b: 60 } },
  })
    .jpeg()
    .toBuffer();
  return new Blob([new Uint8Array(buf)], { type: 'image/jpeg' });
}

async function runTests() {
  const { createApp } = await import('../index.js');
  const { closeDb, getDb } = await import('../db/database.js');
  const { runLifecycleSweep } = await import('../services/lifecycleService.js');

  getDb();
  const app = createApp();
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const addr = server.address() as { port: number };
  baseUrl = `http://127.0.0.1:${addr.port}`;

  try {

  console.log('🧪 Running Peydash End-to-End & Security Test Suite...');

  // 1. Auth validation & OTP flow
  {
    const badPhone = await reqJson('POST', '/api/auth/request-otp', { body: { phone: '02188887777' } });
    assert.equal(badPhone.status, 400);

    const otpReq = await reqJson('POST', '/api/auth/request-otp', { body: { phone: '۰۹۱۲۳۳۳۴۴۵۵' } });
    assert.equal(otpReq.status, 200);
    const badVerify = await reqJson('POST', '/api/auth/verify-otp', {
      body: { phone: '09123334455', code: '00000' },
    });
    assert.equal(badVerify.status, 400);
    console.log('  ✓ 1. Iranian phone validation & OTP verification security passed');
  }

  const finder = await loginUser('09121112233', 'یابنده تست');
  const owner = await loginUser('09124445566', 'مالک واقعی');
  const attacker = await loginUser('09127778899', 'متقاضی نامعتبر');

  // 2. Notification preference persistence
  {
    const me1 = await reqJson('GET', '/api/auth/me', { token: owner.token });
    assert.equal((me1.json.user as { notificationsEnabled: boolean }).notificationsEnabled, false);

    await reqJson('PATCH', '/api/auth/profile', {
      token: owner.token,
      body: { notificationsEnabled: true },
    });
    const me2 = await reqJson('GET', '/api/auth/me', { token: owner.token });
    assert.equal((me2.json.user as { notificationsEnabled: boolean }).notificationsEnabled, true);

    // Also verify X-Peydash-Session header works independently of Authorization/Cookie (for restricted iframes/proxies)
    const customHeaderRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { 'X-Peydash-Session': owner.token },
    });
    assert.equal(customHeaderRes.status, 200, 'X-Peydash-Session header must authenticate cleanly');
    console.log('  ✓ 2. Notification opt-in persistence & X-Peydash-Session header auth passed');
  }

  // 3. Tehran-only geo enforcement & Sensitive ID delivery rules
  const photoBlob = await makeSamplePhotoBlob();
  {
    // Outside Tehran (Isfahan)
    const fdOutside = new FormData();
    fdOutside.append('photo', photoBlob, 'bag.jpg');
    fdOutside.append('title', 'کیف در اصفهان');
    fdOutside.append('category', 'bag');
    fdOutside.append('areaName', 'اصفهان');
    fdOutside.append('lat', '32.6546');
    fdOutside.append('lng', '51.6680');
    fdOutside.append('foundAt', new Date().toISOString());
    fdOutside.append('deliveryMethod', 'courier');
    fdOutside.append(
      'questions',
      JSON.stringify([
        { question: 'رنگ داخلی کیف چیست؟', answer: 'قرمز' },
        { question: 'چه وسیله‌ای داخل آن است؟', answer: 'خودکار' },
        { question: 'برند کیف چیست؟', answer: 'چرم مشهد' },
      ])
    );
    const outsideRes = await reqJson('POST', '/api/items', { token: finder.token, formData: fdOutside });
    assert.equal(outsideRes.status, 400, 'Must reject items outside Tehran');

    // ID document with courier MUST be rejected!
    const fdIdCourier = new FormData();
    fdIdCourier.append('photo', photoBlob, 'id.jpg');
    fdIdCourier.append('title', 'کارت ملی در ونک');
    fdIdCourier.append('category', 'id_documents');
    fdIdCourier.append('areaName', 'میدان ونک');
    fdIdCourier.append('lat', '35.7575');
    fdIdCourier.append('lng', '51.4100');
    fdIdCourier.append('foundAt', new Date().toISOString());
    fdIdCourier.append('deliveryMethod', 'courier');
    fdIdCourier.append(
      'questions',
      JSON.stringify([
        { question: 'نام روی مدرک چیست؟', answer: 'سارا' },
        { question: 'سال تولد چیست؟', answer: '۱۳۷۵' },
        { question: 'رنگ جلد مدرک چیست؟', answer: 'آبی' },
      ])
    );
    const idCourierRes = await reqJson('POST', '/api/items', { token: finder.token, formData: fdIdCourier });
    assert.equal(idCourierRes.status, 400, 'Must reject courier for ID documents');

    // Search outside Tehran MUST fail
    const badSearch = await reqJson('GET', '/api/items/search?lat=32.65&lng=51.66');
    assert.equal(badSearch.status, 400);

    console.log('  ✓ 3. Tehran-only geo enforcement & ID-document Safe Point rule passed');
  }

  // 4. Loser creates 5-day Lost Alert in Vanak -> Finder creates matching Bag -> Auto-notification!
  let bagItemId = '';
  let alertId = '';
  {
    const alertRes = await reqJson('POST', '/api/alerts', {
      token: owner.token,
      body: {
        title: 'کیف چرم مشکی',
        category: 'bag',
        areaName: 'میدان ونک',
        lat: 35.7575,
        lng: 51.4100,
        radiusMeters: 2000,
        lostDate: new Date().toISOString().slice(0, 10),
        timeSlot: 'all_day',
      },
    });
    assert.equal(alertRes.status, 201);
    alertId = String(alertRes.json.alertId);

    const fdBag = new FormData();
    fdBag.append('photo', photoBlob, 'bag.jpg');
    fdBag.append('title', 'کیف چرم در میدان ونک');
    fdBag.append('category', 'bag');
    fdBag.append('areaName', 'میدان ونک');
    fdBag.append('lat', '35.7580');
    fdBag.append('lng', '51.4105');
    fdBag.append('foundAt', new Date().toISOString());
    fdBag.append('deliveryMethod', 'courier');
    fdBag.append(
      'questions',
      JSON.stringify([
        { question: 'رنگ داخلی کیف چیست؟', answer: 'قرمز' },
        { question: 'چه وسیله خاصی داخل آن وجود دارد؟', answer: 'عینک آفتابی' },
        { question: 'یکی از ویژگی‌های ظاهری خاص آن چیست؟', answer: 'سگک طلایی' },
      ])
    );
    const bagRes = await reqJson('POST', '/api/items', { token: finder.token, formData: fdBag });
    assert.equal(bagRes.status, 201);
    assert.equal(bagRes.json.matchedAlerts, 1, 'Should immediately match active Vanak alert');
    bagItemId = String(bagRes.json.itemId);

    const ownerNotifs = await reqJson('GET', '/api/notifications', { token: owner.token });
    const notifs = ownerNotifs.json.notifications as { type: string }[];
    assert.ok(notifs.some((n) => n.type === 'similar_item_found'), 'Loser must receive similar_item_found notification');

    console.log('  ✓ 4. Lost Alert creation & automatic Tehran geo-matching notification passed');
  }

  // 5. Privacy checks: Blurred image, forged full image URL blocked, secret answers & phone hidden
  {
    const detail = await reqJson('GET', `/api/items/${bagItemId}`, { token: attacker.token });
    assert.equal(detail.status, 200);
    const item = detail.json.item as Record<string, unknown>;
    assert.equal(item.imageIsBlurred, true);
    assert.ok(String(item.imageUrl).includes('mode=blurred'));
    assert.ok(!JSON.stringify(detail.json).includes('09121112233'), 'Finder phone MUST NEVER leak');
    assert.ok(!JSON.stringify(detail.json).includes('عینک آفتابی'), 'Secret answers MUST NEVER leak');

    // Verify blurred image actually streams valid JPEG
    const blurFetch = await fetch(`${baseUrl}${String(item.imageUrl)}`);
    assert.equal(blurFetch.status, 200);
    assert.equal(blurFetch.headers.get('content-type'), 'image/jpeg');

    // Forged full-image request MUST fail with 403!
    const forgedUrl = String(item.imageUrl).replace('mode=blurred', 'mode=full');
    const forgedFetch = await fetch(`${baseUrl}${forgedUrl}`);
    assert.equal(forgedFetch.status, 403, 'Forged mode=full image URL MUST be rejected with 403');

    console.log('  ✓ 5. Server-side image blurring, signature enforcement, and secret/phone privacy passed');
  }

  // Also create a second item (ID doc via Safe Point) so we test per-item lockout doesn't block other items
  let idItemId = '';
  {
    const fdId = new FormData();
    fdId.append('photo', photoBlob, 'idcard.jpg');
    fdId.append('title', 'کارت شناسایی در انقلاب');
    fdId.append('category', 'id_documents');
    fdId.append('areaName', 'میدان انقلاب');
    fdId.append('lat', '35.7010');
    fdId.append('lng', '51.3912');
    fdId.append('foundAt', new Date().toISOString());
    fdId.append('deliveryMethod', 'safe_point');
    fdId.append('safePointId', 'sp-enghelab');
    fdId.append(
      'questions',
      JSON.stringify([
        { question: 'نام روی مدرک چیست؟', answer: 'سارا رضایی' },
        { question: 'سال تولد چیست؟', answer: '۱۳۷۵' },
        { question: 'رنگ کاور چیست؟', answer: 'شفاف' },
      ])
    );
    const res = await reqJson('POST', '/api/items', { token: finder.token, formData: fdId });
    assert.equal(res.status, 201);
    idItemId = String(res.json.itemId);
  }

  // 6. 3-Strike Permanent Lockout (survives re-login, per-item only, sends SMS to finder)
  {
    const a1 = await reqJson('POST', '/api/claims', {
      token: attacker.token,
      body: { itemId: bagItemId, answers: ['آبی', 'کتاب', 'زیپ نقره‌ای'] },
    });
    assert.equal(a1.status, 200);
    assert.equal(a1.json.verified, false);
    assert.equal(a1.json.remainingAttempts, 2);

    const a2 = await reqJson('POST', '/api/claims', {
      token: attacker.token,
      body: { itemId: bagItemId, answers: ['سبز', 'کلید', 'برچسب'] },
    });
    assert.equal(a2.status, 200);
    assert.equal(a2.json.remainingAttempts, 1);

    const a3 = await reqJson('POST', '/api/claims', {
      token: attacker.token,
      body: { itemId: bagItemId, answers: ['مشکی', 'پول', 'بند بلند'] },
    });
    assert.equal(a3.status, 403);
    assert.equal(a3.json.permanentlyBlocked, true);
    assert.equal(a3.json.remainingAttempts, 0);

    // Re-login attacker with brand new session token -> MUST STILL BE LOCKED!
    await reqJson('POST', '/api/auth/logout', { token: attacker.token });
    const attackerRelogin = await loginUser('09127778899', 'متقاضی نامعتبر');
    const a4 = await reqJson('POST', '/api/claims', {
      token: attackerRelogin.token,
      body: { itemId: bagItemId, answers: ['قرمز', 'عینک آفتابی', 'سگک طلایی'] },
    });
    assert.equal(a4.status, 403, 'Even with right answers after re-login, 3-strike lockout MUST persist permanently!');

    // Verify attacker can STILL view & access OTHER items!
    const otherItem = await reqJson('GET', `/api/items/${idItemId}`, { token: attackerRelogin.token });
    assert.equal(otherItem.status, 200);
    assert.equal((otherItem.json.item as { permanentlyBlocked: boolean }).permanentlyBlocked, false);

    // Verify SMS was logged to finder upon claim submission
    const db = getDb();
    const smsCount = (
      db
        .prepare(`SELECT COUNT(*) AS cnt FROM sms_logs WHERE recipient_phone = ? AND event_type = 'finder_claim_received'`)
        .get('09121112233') as { cnt: number }
    ).cnt;
    assert.ok(smsCount >= 1, 'Finder MUST receive SMS notification when claim is submitted');

    console.log('  ✓ 6. 3-strike permanent lockout (survives re-login, per-item isolation) & finder SMS passed');
  }

  // 7. Real Owner verifies with 3 answers -> Chat (blocks phone numbers) -> Full Courier Delivery & Digital Receipt
  {
    const verifyRes = await reqJson('POST', '/api/claims', {
      token: owner.token,
      // Test Persian synonym & Arabic character resilience ("سرخ" = "قرمز", "عينك آفتابي" = "عینک آفتابی")
      body: { itemId: bagItemId, answers: ['سرخ', 'عينك آفتابي', 'سگک طلایی'] },
    });
    assert.equal(verifyRes.status, 200);
    assert.equal(verifyRes.json.verified, true);
    const claimId = String(verifyRes.json.claimId);

    // Unverified attacker CANNOT read chat or claim room!
    const spyRoom = await reqJson('GET', `/api/claims/${claimId}`, { token: attacker.token });
    assert.equal(spyRoom.status, 401); // logged out above, let's test another valid user
    const stranger = await loginUser('09129990011', 'غریبه');
    const strangerRoom = await reqJson('GET', `/api/claims/${claimId}`, { token: stranger.token });
    assert.equal(strangerRoom.status, 403, 'Stranger MUST NOT access verified claim room');

    // Chat blocks phone numbers!
    const phoneMsg = await reqJson('POST', `/api/claims/${claimId}/messages`, {
      token: owner.token,
      body: { body: 'سلام لطفا با ۰۹۱۲۴۴۴۵۵۶۶ تماس بگیرید' },
    });
    assert.equal(phoneMsg.status, 400, 'Chat MUST block sharing Iranian phone numbers');
    assert.ok(String(phoneMsg.json.error).includes('شماره تلفن'), 'Error must specifically reject phone sharing');

    // Normal chat message succeeds
    const goodMsg = await reqJson('POST', `/api/claims/${claimId}/messages`, {
      token: owner.token,
      body: { body: 'سلام، خیلی ممنون از امانت‌داری شما. الان درخواست پیک ثبت می‌کنم.' },
    });
    assert.equal(goodMsg.status, 201);

    // Loser requests courier with private home address
    const courierRes = await reqJson('POST', `/api/deliveries/${claimId}/request-courier`, {
      token: owner.token,
      body: {
        destinationArea: 'یوسف‌آباد',
        destinationAddress: 'خیابان اسدآبادی، کوچه ۱۶، پلاک ۴۲ واحد ۵',
        acceptCourierFee: true,
      },
    });
    assert.equal(courierRes.status, 200);

    // Finder inspects claim room: MUST NOT see raw home address, MUST see dynamic 6-digit handover code!
    const finderRoom = await reqJson('GET', `/api/claims/${claimId}`, { token: finder.token });
    assert.equal(finderRoom.status, 200);
    assert.ok(!JSON.stringify(finderRoom.json).includes('پلاک ۴۲'), 'Home address MUST NEVER be exposed to finder!');
    assert.ok(!JSON.stringify(finderRoom.json).includes('09124445566'), 'Owner phone MUST NEVER be exposed to finder!');
    const handoverCode = (finderRoom.json.claim as { delivery: { activeHandoverCode: string } }).delivery.activeHandoverCode;
    assert.match(handoverCode, /^\d{6}$/, 'Dynamic 6-digit handover code must be generated');

    // Loser CANNOT see finder's handover code or confirm courier handover
    const loserBypass = await reqJson('POST', `/api/deliveries/${claimId}/confirm-courier-handover`, {
      token: owner.token,
      body: { code: handoverCode },
    });
    assert.equal(loserBypass.status, 403, 'Loser MUST NOT confirm finder handover');

    // Finder wrong code rejected
    const wrongCode = await reqJson('POST', `/api/deliveries/${claimId}/confirm-courier-handover`, {
      token: finder.token,
      body: { code: '111111' === handoverCode ? '222222' : '111111' },
    });
    assert.equal(wrongCode.status, 400);

    // Finder correct one-time code succeeds
    const handoverOk = await reqJson('POST', `/api/deliveries/${claimId}/confirm-courier-handover`, {
      token: finder.token,
      body: { code: handoverCode },
    });
    assert.equal(handoverOk.status, 200);

    // Finder CANNOT forge final delivery confirmation
    const ownerRoom = await reqJson('GET', `/api/claims/${claimId}`, { token: owner.token });
    const pickupCode = (ownerRoom.json.claim as { delivery: { activePickupCode: string } }).delivery.activePickupCode;
    assert.match(pickupCode, /^\d{6}$/);

    const finderForgeFinal = await reqJson('POST', `/api/deliveries/${claimId}/confirm-delivery`, {
      token: finder.token,
      body: { code: pickupCode },
    });
    assert.equal(finderForgeFinal.status, 403, 'Finder MUST NOT confirm final owner receipt');

    // Owner confirms final receipt -> Digital Receipt issued!
    const finalOk = await reqJson('POST', `/api/deliveries/${claimId}/confirm-delivery`, {
      token: owner.token,
      body: { code: pickupCode },
    });
    assert.equal(finalOk.status, 200);
    assert.ok(String(finalOk.json.finalReceiptNo).startsWith('PYD-DL-'));

    // Reusing one-time code fails
    const replay = await reqJson('POST', `/api/deliveries/${claimId}/confirm-delivery`, {
      token: owner.token,
      body: { code: pickupCode },
    });
    assert.equal(replay.status, 400, 'One-time delivery code cannot be reused');

    console.log('  ✓ 7. Ownership verification, phone-safe chat, courier privacy, OTP handover & Digital Receipt passed');
  }

  // 8. Safe Point Delivery flow on ID Document
  {
    const verifyId = await reqJson('POST', '/api/claims', {
      token: owner.token,
      body: { itemId: idItemId, answers: ['سارا رضایی', '۱۳۷۵', 'شفاف'] },
    });
    assert.equal(verifyId.status, 200);
    assert.equal(verifyId.json.verified, true);
    const idClaimId = String(verifyId.json.claimId);

    // Attempting to request courier for ID Document MUST be rejected on server!
    const badCourierOnId = await reqJson('POST', `/api/deliveries/${idClaimId}/request-courier`, {
      token: owner.token,
      body: {
        destinationArea: 'انقلاب',
        destinationAddress: 'خیابان انقلاب پلاک ۱۰',
        acceptCourierFee: true,
      },
    });
    assert.equal(badCourierOnId.status, 400, 'ID document CANNOT switch to courier');

    // Finder confirms drop-off at Safe Point with one-time code -> Safe Point Receipt issued
    const fRoom = await reqJson('GET', `/api/claims/${idClaimId}`, { token: finder.token });
    const dropCode = (fRoom.json.claim as { delivery: { activeHandoverCode: string } }).delivery.activeHandoverCode;
    const dropOk = await reqJson('POST', `/api/deliveries/${idClaimId}/confirm-safe-point-dropoff`, {
      token: finder.token,
      body: { code: dropCode, operatorName: 'مسئول مترو انقلاب' },
    });
    assert.equal(dropOk.status, 200);
    assert.ok(String(dropOk.json.safePointReceiptNo).startsWith('PYD-SP-'));

    // Owner picks up from Safe Point with one-time pickup code -> Final Receipt issued
    const oRoom = await reqJson('GET', `/api/claims/${idClaimId}`, { token: owner.token });
    const pickCode = (oRoom.json.claim as { delivery: { activePickupCode: string } }).delivery.activePickupCode;
    const pickOk = await reqJson('POST', `/api/deliveries/${idClaimId}/confirm-delivery`, {
      token: owner.token,
      body: { code: pickCode },
    });
    assert.equal(pickOk.status, 200);
    assert.equal(pickOk.json.status, 'delivered');

    console.log('  ✓ 8. Safe Point mandatory flow for ID documents & operator receipt passed');
  }

  // 9. Lifecycle: 3-day Ad Expiry, 5-day Alert Expiry, Near-Expiry notifications & Re-list
  {
    const fdTemp = new FormData();
    fdTemp.append('photo', photoBlob, 'key.jpg');
    fdTemp.append('title', 'کلید پارکینگ در تجریش');
    fdTemp.append('category', 'keys');
    fdTemp.append('areaName', 'میدان تجریش');
    fdTemp.append('lat', '35.8044');
    fdTemp.append('lng', '51.4281');
    fdTemp.append('foundAt', new Date().toISOString());
    fdTemp.append('deliveryMethod', 'courier');
    fdTemp.append(
      'questions',
      JSON.stringify([
        { question: 'چند کلید است؟', answer: '۳' },
        { question: 'جاکلیدی چه رنگی است؟', answer: 'قرمز' },
        { question: 'علامت خاص چیست؟', answer: 'ریموت مشکی' },
      ])
    );
    const created = await reqJson('POST', '/api/items', { token: finder.token, formData: fdTemp });
    const tempItemId = String(created.json.itemId);

    const db = getDb();
    // Simulate near-expiry (4 hours left)
    const fourHoursAhead = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
    db.prepare(`UPDATE found_items SET expires_at = ? WHERE id = ?`).run(fourHoursAhead, tempItemId);
    const sweep1 = runLifecycleSweep();
    assert.equal(sweep1.nearExpiryItems, 1);

    // Simulate expired (1 minute ago)
    const pastIso = new Date(Date.now() - 60_000).toISOString();
    db.prepare(`UPDATE found_items SET expires_at = ? WHERE id = ?`).run(pastIso, tempItemId);
    db.prepare(`UPDATE lost_alerts SET expires_at = ? WHERE id = ?`).run(pastIso, alertId);
    const sweep2 = runLifecycleSweep();
    assert.equal(sweep2.expiredItems, 1);
    assert.equal(sweep2.expiredAlerts, 1);

    // Relist expired item & expired alert
    const relistItem = await reqJson('POST', `/api/items/${tempItemId}/relist`, { token: finder.token });
    assert.equal(relistItem.status, 200);
    assert.equal(relistItem.json.status, 'active');

    const relistAlert = await reqJson('POST', `/api/alerts/${alertId}/relist`, { token: owner.token });
    assert.equal(relistAlert.status, 200);
    assert.equal(relistAlert.json.status, 'active');

    // 10. Safety: Report suspicious ad & User Block
    const rep1 = await reqJson('POST', '/api/safety/report', {
      token: owner.token,
      body: { itemId: tempItemId, reason: 'fake_ad', details: 'تست گزارش' },
    });
    assert.equal(rep1.status, 201);
    const repDup = await reqJson('POST', '/api/safety/report', {
      token: owner.token,
      body: { itemId: tempItemId, reason: 'fake_ad' },
    });
    assert.equal(repDup.status, 400, 'Duplicate report from same user should be rejected');

    const blk = await reqJson('POST', '/api/safety/block', {
      token: owner.token,
      body: { itemId: tempItemId, reason: 'تست مسدودسازی' },
    });
    assert.equal(blk.status, 201);

    // Blocked finder's item must be hidden from blocker
    const blockedDetail = await reqJson('GET', `/api/items/${tempItemId}`, { token: owner.token });
    assert.equal(blockedDetail.status, 403);

    console.log('  ✓ 9. 3-day ad / 5-day alert expiry, near-expiry alerts, re-list, report & block passed');
  }

  console.log('\n✅ ALL 10 END-TO-END & SECURITY TEST SUITES PASSED 100%!');
  } finally {
    if (server) server.close();
    closeDb();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exitCode = 1;
});
