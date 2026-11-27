import fs from 'node:fs';
import { Router } from 'express';
import {
  CATEGORIES,
  CONFIG,
  DELIVERY_SECURITY_ADVISORY,
  OWNERSHIP_ATTEMPTS_WARNING,
  STORAGE_DIR,
} from '../config.js';
import { TEHRAN_PLACES } from '../data/tehranData.js';
import { checkDbHealth, getDb } from '../db/database.js';

export const metaRouter = Router();

metaRouter.get('/health', (_req, res) => {
  const dbHealth = checkDbHealth();
  let storageOk = false;
  try {
    fs.accessSync(STORAGE_DIR, fs.constants.R_OK | fs.constants.W_OK);
    storageOk = true;
  } catch {
    storageOk = false;
  }

  const healthy = dbHealth.ok && storageOk;
  res.status(healthy ? 200 : 503).json({
    ok: healthy,
    status: healthy ? 'healthy' : 'degraded',
    service: 'ChikojA-api',
    city: 'Tehran',
    checks: {
      database: dbHealth.ok ? 'ok' : 'error',
      storage: storageOk ? 'ok' : 'error',
    },
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

metaRouter.get('/meta/config', (_req, res) => {
  const db = getDb();
  const safePoints = db
    .prepare(`SELECT id, name, type, area, address, lat, lng, hours FROM safe_points WHERE is_active = 1`)
    .all();

  res.json({
    city: 'تهران',
    bounds: CONFIG.TEHRAN_BOUNDS,
    categories: CATEGORIES,
    places: TEHRAN_PLACES,
    safePoints,
    rules: {
      foundItemTtlDays: CONFIG.FOUND_ITEM_TTL_DAYS,
      lostAlertTtlDays: CONFIG.LOST_ALERT_TTL_DAYS,
      maxWrongOwnershipAttempts: CONFIG.MAX_WRONG_OWNERSHIP_ATTEMPTS,
      ownershipWarningText: OWNERSHIP_ATTEMPTS_WARNING,
      deliverySecurityAdvisory: DELIVERY_SECURITY_ADVISORY,
    },
    smsMode: CONFIG.SMS_PROVIDER === 'kavenegar' && CONFIG.KAVENEGAR_API_KEY ? 'live' : 'sandbox',
  });
});
