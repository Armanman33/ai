import { getDb, nowIso } from '../db/database.js';
import { generateId } from '../utils/crypto.js';

export type AuditEntityType = 'item' | 'alert' | 'claim' | 'delivery';

export interface AuditEntry {
  id: string;
  entity_type: AuditEntityType;
  entity_id: string;
  actor_id: string | null;
  actor_role: string;
  from_status: string | null;
  to_status: string;
  note: string;
  created_at: string;
}

export function logStatusChange(params: {
  entityType: AuditEntityType;
  entityId: string;
  actorId?: string | null;
  actorRole: 'finder' | 'loser' | 'safe_point_operator' | 'system';
  fromStatus?: string | null;
  toStatus: string;
  note?: string;
}): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO audit_logs (id, entity_type, entity_id, actor_id, actor_role, from_status, to_status, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    generateId(),
    params.entityType,
    params.entityId,
    params.actorId ?? null,
    params.actorRole,
    params.fromStatus ?? null,
    params.toStatus,
    params.note ?? '',
    nowIso()
  );
}

export function getAuditLogs(entityType: AuditEntityType, entityId: string): AuditEntry[] {
  const db = getDb();
  return db
    .prepare(`
      SELECT id, entity_type, entity_id, actor_id, actor_role, from_status, to_status, note, created_at
      FROM audit_logs
      WHERE entity_type = ? AND entity_id = ?
      ORDER BY created_at ASC
    `)
    .all(entityType, entityId) as unknown as AuditEntry[];
}
