import { getDb } from '../db/database.js';
import { haversineDistanceMeters } from '../utils/geo.js';
import { normalizePersianText } from '../utils/persian.js';
import { createNotification } from './notificationService.js';

interface ActiveAlertRow {
  id: string;
  user_id: string;
  title: string;
  category: string;
  area_name: string;
  lat: number;
  lng: number;
  radius_meters: number;
}

interface FoundItemMatchInput {
  id: string;
  finderId: string;
  title: string;
  category: string;
  areaName: string;
  lat: number;
  lng: number;
}

export function notifyMatchingAlertsForFoundItem(item: FoundItemMatchInput): number {
  const db = getDb();
  const now = new Date().toISOString();

  const alerts = db
    .prepare(`
      SELECT a.id, a.user_id, a.title, a.category, a.area_name, a.lat, a.lng, a.radius_meters
      FROM lost_alerts a
      WHERE a.status = 'active'
        AND a.expires_at > ?
        AND a.user_id != ?
        AND (a.category = ? OR a.category = 'other' OR ? = 'other')
        AND NOT EXISTS (
          SELECT 1 FROM user_blocks b
          WHERE (b.blocker_id = a.user_id AND b.blocked_id = ?)
             OR (b.blocker_id = ? AND b.blocked_id = a.user_id)
        )
    `)
    .all(now, item.finderId, item.category, item.category, item.finderId, item.finderId) as unknown as ActiveAlertRow[];

  let matchedCount = 0;

  for (const alert of alerts) {
    const distance = haversineDistanceMeters(item.lat, item.lng, alert.lat, alert.lng);
    // Match if within alert radius (+ 1000m Tehran neighborhood tolerance)
    if (distance <= alert.radius_meters + 1000) {
      // Check title overlap if category was 'other'
      if (alert.category !== item.category) {
        const aTokens = new Set(normalizePersianText(alert.title).split(' ').filter((t) => t.length >= 2));
        const iTokens = normalizePersianText(item.title).split(' ').filter((t) => t.length >= 2);
        const hasOverlap = iTokens.some((t) => aTokens.has(t));
        if (!hasOverlap) continue;
      }

      createNotification({
        userId: alert.user_id,
        type: 'similar_item_found',
        title: 'پیدا شدن مورد مشابه در تهران',
        body: `آگهی جدید «${item.title}» در محدوده ${item.areaName} ثبت شد که با هشدار «${alert.title}» شما تطابق دارد.`,
        linkPath: `/items/${item.id}`,
        metadata: { itemId: item.id, alertId: alert.id, distanceMeters: distance },
      });
      matchedCount++;
    }
  }

  return matchedCount;
}
