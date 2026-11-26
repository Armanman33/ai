import { CONFIG } from '../config.js';
import { getDb, nowIso } from '../db/database.js';
import { logStatusChange } from './auditService.js';
import { createNotification } from './notificationService.js';

interface ExpirableItemRow {
  id: string;
  finder_id: string;
  title: string;
  expires_at: string;
}

interface ExpirableAlertRow {
  id: string;
  user_id: string;
  title: string;
  expires_at: string;
}

export function runLifecycleSweep(): {
  expiredItems: number;
  nearExpiryItems: number;
  expiredAlerts: number;
  nearExpiryAlerts: number;
} {
  const db = getDb();
  const now = new Date();
  const nowStr = now.toISOString();
  const nearThresholdStr = new Date(
    now.getTime() + CONFIG.NEAR_EXPIRY_HOURS * 60 * 60 * 1000
  ).toISOString();

  // 1. Expire active found items past 3-day TTL
  const toExpireItems = db
    .prepare(`
      SELECT id, finder_id, title, expires_at
      FROM found_items
      WHERE status = 'active' AND expires_at <= ?
    `)
    .all(nowStr) as unknown as ExpirableItemRow[];

  for (const item of toExpireItems) {
    db.prepare(`UPDATE found_items SET status = 'expired', updated_at = ? WHERE id = ?`).run(
      nowStr,
      item.id
    );
    logStatusChange({
      entityType: 'item',
      entityId: item.id,
      actorRole: 'system',
      fromStatus: 'active',
      toStatus: 'expired',
      note: 'انقضای خودکار پس از پایان مهلت ۳ روزه',
    });
    createNotification({
      userId: item.finder_id,
      type: 'item_expired',
      title: 'آگهی شما منقضی شد',
      body: `مهلت ۳ روزه آگهی «${item.title}» به پایان رسید. در صورت نیاز می‌توانید آن را مجدداً ثبت کنید.`,
      linkPath: '/my-ads',
      metadata: { itemId: item.id },
    });
  }

  // 2. Notify near-expiry found items (<= 12 hours left)
  const nearItems = db
    .prepare(`
      SELECT id, finder_id, title, expires_at
      FROM found_items
      WHERE status = 'active'
        AND near_expiry_notified = 0
        AND expires_at > ?
        AND expires_at <= ?
    `)
    .all(nowStr, nearThresholdStr) as unknown as ExpirableItemRow[];

  for (const item of nearItems) {
    db.prepare(`UPDATE found_items SET near_expiry_notified = 1, updated_at = ? WHERE id = ?`).run(
      nowStr,
      item.id
    );
    createNotification({
      userId: item.finder_id,
      type: 'item_expiring_soon',
      title: 'نزدیک شدن به انقضای آگهی',
      body: `کمتر از ۱۲ ساعت تا پایان مهلت ۳ روزه آگهی «${item.title}» باقی مانده است.`,
      linkPath: '/my-ads',
      metadata: { itemId: item.id },
    });
  }

  // 3. Expire active lost alerts past 5-day TTL
  const toExpireAlerts = db
    .prepare(`
      SELECT id, user_id, title, expires_at
      FROM lost_alerts
      WHERE status = 'active' AND expires_at <= ?
    `)
    .all(nowStr) as unknown as ExpirableAlertRow[];

  for (const alert of toExpireAlerts) {
    db.prepare(`UPDATE lost_alerts SET status = 'expired', updated_at = ? WHERE id = ?`).run(
      nowStr,
      alert.id
    );
    logStatusChange({
      entityType: 'alert',
      entityId: alert.id,
      actorRole: 'system',
      fromStatus: 'active',
      toStatus: 'expired',
      note: 'انقضای خودکار پس از پایان مهلت ۵ روزه',
    });
    createNotification({
      userId: alert.user_id,
      type: 'alert_expired',
      title: 'هشدار گم‌شدن شما منقضی شد',
      body: `مهلت ۵ روزه هشدار «${alert.title}» به پایان رسید. در صورت ادامه جست‌وجو می‌توانید آن را دوباره فعال کنید.`,
      linkPath: '/my-alerts',
      metadata: { alertId: alert.id },
    });
  }

  // 4. Notify near-expiry alerts (<= 12 hours left)
  const nearAlerts = db
    .prepare(`
      SELECT id, user_id, title, expires_at
      FROM lost_alerts
      WHERE status = 'active'
        AND near_expiry_notified = 0
        AND expires_at > ?
        AND expires_at <= ?
    `)
    .all(nowStr, nearThresholdStr) as unknown as ExpirableAlertRow[];

  for (const alert of nearAlerts) {
    db.prepare(`UPDATE lost_alerts SET near_expiry_notified = 1, updated_at = ? WHERE id = ?`).run(
      nowStr,
      alert.id
    );
    createNotification({
      userId: alert.user_id,
      type: 'alert_expiring_soon',
      title: 'نزدیک شدن به انقضای هشدار',
      body: `کمتر از ۱۲ ساعت تا پایان مهلت ۵ روزه هشدار «${alert.title}» باقی مانده است.`,
      linkPath: '/my-alerts',
      metadata: { alertId: alert.id },
    });
  }

  // Clean up expired sessions & old OTP codes
  db.prepare(`DELETE FROM sessions WHERE expires_at <= ?`).run(nowIso());

  return {
    expiredItems: toExpireItems.length,
    nearExpiryItems: nearItems.length,
    expiredAlerts: toExpireAlerts.length,
    nearExpiryAlerts: nearAlerts.length,
  };
}

let schedulerTimer: NodeJS.Timeout | null = null;

export function startLifecycleScheduler(): void {
  runLifecycleSweep();
  if (schedulerTimer) clearInterval(schedulerTimer);
  schedulerTimer = setInterval(() => {
    try {
      runLifecycleSweep();
    } catch (err) {
      console.error('[lifecycle] sweep error:', err);
    }
  }, 60_000);
  schedulerTimer.unref();
}
