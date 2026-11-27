import fs from 'node:fs';
import path from 'node:path';
import { CONFIG, PREVIEWS_DIR, UPLOADS_DIR } from '../config.js';
import { getDb } from '../db/database.js';
import { deleteItemImageFiles, deleteStoredImageFile } from '../utils/imageBlur.js';
import { logger } from '../utils/logger.js';
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

interface PurgeableItemRow {
  id: string;
  image_path: string;
  blurred_image_path: string;
}

export interface StorageCleanupOptions {
  forceOrphanScan?: boolean;
  forceCompact?: boolean;
  orphanGraceMs?: number;
}

export interface StorageCleanupStats {
  purgedExpiredItems: number;
  purgedRemovedItems: number;
  purgedDeliveredItems: number;
  purgedAlerts: number;
  prunedSmsLogs: number;
  prunedNotifications: number;
  prunedAuditLogs: number;
  deletedItemImages: number;
  deletedOrphanFiles: number;
  walCheckpointed: boolean;
  vacuumed: boolean;
}

const ORPHAN_SCAN_INTERVAL_MS = 15 * 60 * 1000;
const VACUUM_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000;
const VACUUM_FREELIST_THRESHOLD = 64;

let lastOrphanScanAt = 0;
let lastVacuumAt = 0;

function daysAgoIso(now: Date, days: number): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
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
      body: `مهلت ۳ روزه آگهی «${item.title}» به پایان رسید. تا ${CONFIG.EXPIRED_ITEM_PURGE_DAYS} روز آینده می‌توانید آن را مجدداً ثبت کنید؛ پس از آن به‌صورت خودکار و دائمی حذف می‌شود.`,
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
      body: `مهلت ۵ روزه هشدار «${alert.title}» به پایان رسید. تا ${CONFIG.EXPIRED_ALERT_PURGE_DAYS} روز آینده می‌توانید آن را دوباره فعال کنید؛ پس از آن به‌صورت خودکار حذف می‌شود.`,
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

  // 5. Clean up expired sessions & stale OTP codes (> 24h old)
  const cutoffOtpIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`DELETE FROM sessions WHERE expires_at <= ?`).run(nowStr);
  db.prepare(`DELETE FROM otp_codes WHERE expires_at <= ? OR created_at <= ?`).run(cutoffOtpIso, cutoffOtpIso);

  return {
    expiredItems: toExpireItems.length,
    nearExpiryItems: nearItems.length,
    expiredAlerts: toExpireAlerts.length,
    nearExpiryAlerts: nearAlerts.length,
  };
}

function isImagePathStillReferenced(
  db: ReturnType<typeof getDb>,
  relPath: string
): boolean {
  const ref = db
    .prepare(`SELECT 1 FROM found_items WHERE image_path = ? OR blurred_image_path = ? LIMIT 1`)
    .get(relPath, relPath);
  return Boolean(ref);
}

function purgeItemsWithImages(
  db: ReturnType<typeof getDb>,
  rows: PurgeableItemRow[]
): { deletedRows: number; deletedFiles: number } {
  let deletedRows = 0;
  let deletedFiles = 0;
  const deleteStmt = db.prepare(`DELETE FROM found_items WHERE id = ?`);

  for (const row of rows) {
    const info = deleteStmt.run(row.id);
    if (Number(info.changes) > 0) {
      deletedRows += 1;
      if (row.image_path && !isImagePathStillReferenced(db, row.image_path)) {
        if (deleteStoredImageFile(row.image_path)) deletedFiles += 1;
      }
      if (row.blurred_image_path && !isImagePathStillReferenced(db, row.blurred_image_path)) {
        if (deleteStoredImageFile(row.blurred_image_path)) deletedFiles += 1;
      }
    }
  }

  return { deletedRows, deletedFiles };
}

function sweepOrphanImageFiles(
  db: ReturnType<typeof getDb>,
  graceMs: number
): number {
  const referenced = new Set<string>();
  const rows = db
    .prepare(`SELECT image_path, blurred_image_path FROM found_items WHERE status != 'removed'`)
    .all() as { image_path: string; blurred_image_path: string }[];

  for (const row of rows) {
    if (row.image_path) referenced.add(row.image_path.replace(/\\/g, '/'));
    if (row.blurred_image_path) referenced.add(row.blurred_image_path.replace(/\\/g, '/'));
  }

  const cutoffMs = Date.now() - Math.max(0, graceMs);
  let deleted = 0;

  const dirs: Array<{ dir: string; prefix: string }> = [
    { dir: UPLOADS_DIR, prefix: 'uploads' },
    { dir: PREVIEWS_DIR, prefix: 'previews' },
  ];

  for (const { dir, prefix } of dirs) {
    if (!fs.existsSync(dir)) continue;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isFile() || entry.name.startsWith('.')) continue;
      const relPath = `${prefix}/${entry.name}`;
      if (referenced.has(relPath)) continue;

      const absPath = path.join(dir, entry.name);
      try {
        const stat = fs.statSync(absPath);
        if (stat.mtimeMs <= cutoffMs) {
          if (deleteStoredImageFile(relPath)) {
            deleted += 1;
          }
        }
      } catch {
        // File may have been removed concurrently
      }
    }
  }

  return deleted;
}

/**
 * Automatically purges old expired/removed/delivered items, expired alerts,
 * stale logs, orphaned image files on disk, and reclaims SQLite WAL/freelist space.
 */
export function runStorageCleanup(options: StorageCleanupOptions = {}): StorageCleanupStats {
  const db = getDb();
  const now = new Date();

  const expiredItemCutoff = daysAgoIso(now, CONFIG.EXPIRED_ITEM_PURGE_DAYS);
  const removedItemCutoff = daysAgoIso(now, CONFIG.REMOVED_ITEM_PURGE_DAYS);
  const deliveredItemCutoff = daysAgoIso(now, CONFIG.DELIVERED_ITEM_PURGE_DAYS);
  const expiredAlertCutoff = daysAgoIso(now, CONFIG.EXPIRED_ALERT_PURGE_DAYS);
  const logCutoff = daysAgoIso(now, CONFIG.LOG_RETENTION_DAYS);
  const unreadNotifCutoff = daysAgoIso(now, CONFIG.LOG_RETENTION_DAYS * 2);

  let deletedItemImages = 0;

  // 1. Purge expired found items past grace retention period (preserving any with pending/verified claims)
  const expiredRows = db
    .prepare(`
      SELECT id, image_path, blurred_image_path
      FROM found_items
      WHERE status = 'expired'
        AND is_demo = 0
        AND expires_at <= ?
        AND updated_at <= ?
        AND NOT EXISTS (
          SELECT 1 FROM ownership_claims c
          WHERE c.item_id = found_items.id
            AND c.status IN ('pending_review', 'verified')
        )
    `)
    .all(expiredItemCutoff, expiredItemCutoff) as unknown as PurgeableItemRow[];

  const expiredPurge = purgeItemsWithImages(db, expiredRows);
  deletedItemImages += expiredPurge.deletedFiles;

  // 2. Ensure ALL 'removed' non-demo items have their disk images freed immediately,
  //    then purge 'removed' rows older than REMOVED_ITEM_PURGE_DAYS
  const lingeringRemovedMedia = db
    .prepare(`
      SELECT id, image_path, blurred_image_path
      FROM found_items
      WHERE status = 'removed' AND is_demo = 0
    `)
    .all() as unknown as PurgeableItemRow[];

  for (const row of lingeringRemovedMedia) {
    const activeRef = db
      .prepare(
        `SELECT 1 FROM found_items WHERE id != ? AND status != 'removed' AND (image_path = ? OR blurred_image_path = ?) LIMIT 1`
      )
      .get(row.id, row.image_path, row.blurred_image_path);
    if (!activeRef) {
      deletedItemImages += deleteItemImageFiles(row.image_path, row.blurred_image_path);
    }
  }

  const removedRowsToPurge = db
    .prepare(`
      SELECT id, image_path, blurred_image_path
      FROM found_items
      WHERE status = 'removed'
        AND is_demo = 0
        AND updated_at <= ?
    `)
    .all(removedItemCutoff) as unknown as PurgeableItemRow[];

  const removedPurge = purgeItemsWithImages(db, removedRowsToPurge);
  deletedItemImages += removedPurge.deletedFiles;

  // 3. Purge archived 'delivered' items older than DELIVERED_ITEM_PURGE_DAYS
  const deliveredRows = db
    .prepare(`
      SELECT id, image_path, blurred_image_path
      FROM found_items
      WHERE status = 'delivered'
        AND is_demo = 0
        AND updated_at <= ?
    `)
    .all(deliveredItemCutoff) as unknown as PurgeableItemRow[];

  const deliveredPurge = purgeItemsWithImages(db, deliveredRows);
  deletedItemImages += deliveredPurge.deletedFiles;

  // 4. Purge old expired / resolved lost alerts past grace window
  const purgedAlertsInfo = db
    .prepare(`
      DELETE FROM lost_alerts
      WHERE is_demo = 0
        AND status IN ('expired', 'resolved')
        AND updated_at <= ?
        AND (status = 'resolved' OR expires_at <= ?)
    `)
    .run(expiredAlertCutoff, expiredAlertCutoff);
  const purgedAlerts = Number(purgedAlertsInfo.changes || 0);

  // 5. Prune old sms_logs, notifications, and orphaned audit_logs
  const prunedSmsLogs = Number(
    db.prepare(`DELETE FROM sms_logs WHERE created_at <= ?`).run(logCutoff).changes || 0
  );

  const prunedNotifications = Number(
    db
      .prepare(`DELETE FROM notifications WHERE (is_read = 1 AND created_at <= ?) OR created_at <= ?`)
      .run(logCutoff, unreadNotifCutoff).changes || 0
  );

  const prunedAuditLogs = Number(
    db
      .prepare(`
        DELETE FROM audit_logs
        WHERE created_at <= ?
          AND (
            (entity_type = 'item' AND NOT EXISTS (SELECT 1 FROM found_items fi WHERE fi.id = audit_logs.entity_id))
            OR (entity_type = 'alert' AND NOT EXISTS (SELECT 1 FROM lost_alerts la WHERE la.id = audit_logs.entity_id))
            OR (entity_type = 'claim' AND NOT EXISTS (SELECT 1 FROM ownership_claims oc WHERE oc.id = audit_logs.entity_id))
            OR (entity_type = 'delivery' AND NOT EXISTS (SELECT 1 FROM deliveries d WHERE d.id = audit_logs.entity_id))
          )
      `)
      .run(logCutoff).changes || 0
  );

  // 6. Sweep orphaned image files on disk (throttled to every 15 min unless forced)
  let deletedOrphanFiles = 0;
  const nowMs = Date.now();
  if (options.forceOrphanScan || nowMs - lastOrphanScanAt >= ORPHAN_SCAN_INTERVAL_MS) {
    lastOrphanScanAt = nowMs;
    const graceMs =
      options.orphanGraceMs !== undefined
        ? options.orphanGraceMs
        : CONFIG.ORPHAN_FILE_GRACE_MINUTES * 60 * 1000;
    deletedOrphanFiles = sweepOrphanImageFiles(db, graceMs);
  }

  // 7. Reclaim SQLite WAL & dead DB pages so disk space actually returns to OS
  const totalRowsPurged =
    expiredPurge.deletedRows +
    removedPurge.deletedRows +
    deliveredPurge.deletedRows +
    purgedAlerts +
    prunedSmsLogs +
    prunedNotifications +
    prunedAuditLogs;

  let walCheckpointed = false;
  let vacuumed = false;

  if (totalRowsPurged > 0 || options.forceCompact) {
    try {
      db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
      walCheckpointed = true;
    } catch {
      // Safe to retry on next sweep if a reader holds a lock
    }

    try {
      const freelistRow = db.prepare('PRAGMA freelist_count').get() as { freelist_count?: number } | undefined;
      const freePages = Number(freelistRow?.freelist_count || 0);
      const shouldVacuum =
        (options.forceCompact && freePages > 0) ||
        (freePages >= VACUUM_FREELIST_THRESHOLD && nowMs - lastVacuumAt >= VACUUM_MIN_INTERVAL_MS);

      if (shouldVacuum) {
        db.exec('VACUUM; PRAGMA optimize;');
        lastVacuumAt = nowMs;
        vacuumed = true;
      }
    } catch (err) {
      logger.warn('sqlite_compaction_skipped', {
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const stats: StorageCleanupStats = {
    purgedExpiredItems: expiredPurge.deletedRows,
    purgedRemovedItems: removedPurge.deletedRows,
    purgedDeliveredItems: deliveredPurge.deletedRows,
    purgedAlerts,
    prunedSmsLogs,
    prunedNotifications,
    prunedAuditLogs,
    deletedItemImages,
    deletedOrphanFiles,
    walCheckpointed,
    vacuumed,
  };

  if (totalRowsPurged > 0 || deletedItemImages > 0 || deletedOrphanFiles > 0 || vacuumed) {
    logger.info('storage_cleanup_completed', { ...stats });
  }

  return stats;
}

let schedulerTimer: NodeJS.Timeout | null = null;

export function startLifecycleScheduler(): void {
  runLifecycleSweep();
  runStorageCleanup({ forceOrphanScan: true });
  if (schedulerTimer) clearInterval(schedulerTimer);
  schedulerTimer = setInterval(() => {
    try {
      runLifecycleSweep();
      runStorageCleanup();
    } catch (err) {
      logger.error('lifecycle_scheduler_error', {
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
  }, 60_000);
  schedulerTimer.unref();
}

export function stopLifecycleScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
}
