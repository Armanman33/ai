import { getDb, nowIso } from '../db/database.js';
import { generateId } from '../utils/crypto.js';

export type NotificationType =
  // Loser notifications
  | 'similar_item_found'
  | 'finder_replied'
  | 'ownership_verified'
  | 'delivery_status_changed'
  | 'alert_expiring_soon'
  | 'alert_expired'
  // Finder notifications
  | 'claim_received'
  | 'claimant_verified'
  | 'new_message'
  | 'courier_requested'
  | 'delivery_confirmed'
  | 'item_expiring_soon'
  | 'item_expired';

export function createNotification(params: {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  linkPath?: string;
  metadata?: Record<string, unknown>;
}): string {
  const db = getDb();
  const id = generateId();
  db.prepare(`
    INSERT INTO notifications (id, user_id, type, title, body, link_path, metadata_json, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
  `).run(
    id,
    params.userId,
    params.type,
    params.title,
    params.body,
    params.linkPath || '/',
    JSON.stringify(params.metadata || {}),
    nowIso()
  );
  return id;
}
