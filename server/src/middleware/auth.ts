import { Request, Response, NextFunction } from 'express';
import { getDb, nowIso } from '../db/database.js';
import { hashSecret } from '../utils/crypto.js';

export interface AuthUser {
  id: string;
  phone: string;
  displayName: string;
  notificationsEnabled: boolean;
  isDemo: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      sessionTokenHash?: string;
    }
  }
}

export const SESSION_COOKIE_NAME = 'peydash_session';

function extractToken(req: Request): string | null {
  const customHeader = req.headers['x-peydash-session'];
  if (typeof customHeader === 'string' && customHeader.trim()) {
    return customHeader.trim();
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }
  const cookieToken = req.cookies?.[SESSION_COOKIE_NAME];
  if (typeof cookieToken === 'string' && cookieToken.trim()) {
    return cookieToken.trim();
  }
  return null;
}

export function attachUser(req: Request, _res: Response, next: NextFunction): void {
  const rawToken = extractToken(req);
  if (!rawToken) {
    next();
    return;
  }

  const tokenHash = hashSecret(rawToken);
  const db = getDb();
  const row = db
    .prepare(`
      SELECT u.id, u.phone, u.display_name, u.notifications_enabled, u.is_demo, u.is_suspended, s.expires_at
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?
    `)
    .get(tokenHash) as
    | {
        id: string;
        phone: string;
        display_name: string;
        notifications_enabled: number;
        is_demo: number;
        is_suspended: number;
        expires_at: string;
      }
    | undefined;

  if (!row || row.is_suspended || row.expires_at <= nowIso()) {
    next();
    return;
  }

  req.user = {
    id: row.id,
    phone: row.phone,
    displayName: row.display_name,
    notificationsEnabled: Boolean(row.notifications_enabled),
    isDemo: Boolean(row.is_demo),
  };
  req.sessionTokenHash = tokenHash;
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'برای ادامه لطفاً ابتدا وارد حساب کاربری خود شوید.' });
    return;
  }
  next();
}
