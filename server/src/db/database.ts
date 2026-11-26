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
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    dbInstance.exec(schemaSql);
    ensureSafePoints(dbInstance);
  }
  return dbInstance;
}

function ensureSafePoints(db: DatabaseSync): void {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO safe_points (id, name, type, area, address, lat, lng, hours, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);
  for (const sp of SAFE_POINTS_SEED) {
    stmt.run(sp.id, sp.name, sp.type, sp.area, sp.address, sp.lat, sp.lng, sp.hours);
  }
}

export function closeDb(): void {
  if (dbInstance) {
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
