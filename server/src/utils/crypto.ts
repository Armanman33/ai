import crypto from 'node:crypto';
import { CONFIG } from '../config.js';

const ENC_KEY = crypto.createHash('sha256').update(CONFIG.APP_SECRET + ':aes-key').digest();

export function generateId(): string {
  return crypto.randomUUID();
}

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function generateOtpCode(): string {
  return String(crypto.randomInt(10000, 100000));
}

export function generateOneTimeDeliveryCode(): string {
  // Cryptographically secure 6-digit single-use handover code (never static)
  return String(crypto.randomInt(100000, 1000000));
}

export function generateReceiptNumber(prefix: 'SP' | 'DL'): string {
  const randomPart = crypto.randomBytes(3).toString('hex').toUpperCase();
  const numPart = crypto.randomInt(1000, 9999);
  return `PYD-${prefix}-${numPart}-${randomPart}`;
}

export function hashSecret(value: string): string {
  return crypto.createHmac('sha256', CONFIG.APP_SECRET).update(value).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function encryptText(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptText(payload: string): string {
  const parts = payload.split('.');
  if (parts.length !== 3) throw new Error('Invalid encrypted payload');
  const [ivB64, tagB64, dataB64] = parts;
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, Buffer.from(ivB64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64url')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

export function signImageUrl(itemId: string, mode: 'blurred' | 'full', ttlSeconds = 3600): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = crypto
    .createHmac('sha256', CONFIG.APP_SECRET)
    .update(`img:${itemId}:${mode}:${exp}`)
    .digest('base64url');
  return `/api/items/${encodeURIComponent(itemId)}/image?mode=${mode}&exp=${exp}&sig=${sig}`;
}

export function verifyImageSignature(
  itemId: string,
  mode: 'blurred' | 'full',
  expStr: string,
  sig: string
): boolean {
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
    return false;
  }
  const expected = crypto
    .createHmac('sha256', CONFIG.APP_SECRET)
    .update(`img:${itemId}:${mode}:${exp}`)
    .digest('base64url');
  return safeEqual(expected, sig);
}
