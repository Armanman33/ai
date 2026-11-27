import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { DB_PATH } from '../config.js';
import { SAFE_POINTS_SEED } from '../data/tehranData.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let dbInstance: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (!dbInstance) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    dbInstance = new DatabaseSync(DB_PATH);
    // Production SQLite concurrency & durability settings (WAL + busy_timeout)
    dbInstance.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA busy_timeout = 5000;
      PRAGMA temp_store = MEMORY;
    `);
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    dbInstance.exec(schemaSql);
    ensureSafePoints(dbInstance);
  }
  return dbInstance;
}

/**
 * Executes a callback inside an atomic SQLite IMMEDIATE transaction
 * to prevent concurrent race conditions (e.g., 3-strike bypass or double claims).
 */
export function runInTransaction<T>(fn: (db: DatabaseSync) => T): T {
  const db = getDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn(db);
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // ignore rollback error if transaction already closed
    }
    throw err;
  }
}

export function checkDbHealth(): { ok: boolean; error?: string } {
  try {
    const db = getDb();
    const row = db.prepare('SELECT 1 AS alive').get() as { alive: number } | undefined;
    return { ok: row?.alive === 1 };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'DB health error' };
  }
}

function ensureSafePoints(db: DatabaseSync): void {
  const stmt = db.prepare(`
    INSERT INTO safe_points (id, name, type, area, address, lat, lng, hours, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      address = excluded.address,
      hours = excluded.hours
  `);
  for (const sp of SAFE_POINTS_SEED) {
    stmt.run(sp.id, sp.name, sp.type, sp.area, sp.address, sp.lat, sp.lng, sp.hours);
  }
}

export function closeDb(): void {
  if (dbInstance) {
    try {
      dbInstance.exec('PRAGMA wal_checkpoint(PASSIVE);');
    } catch {
      // ignore checkpoint error on shutdown
    }
    dbInstance.close();
    dbInstance = null;
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function addDaysIso(date: Date, days: number): string {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

export function addMinutesIso(date: Date, minutes: number): string {
  return new Date(date.getTime() + minutes * 60 * 1000).toISOString();
}
