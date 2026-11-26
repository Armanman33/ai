import { Router } from 'express';
import { getDb } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { runLifecycleSweep } from '../services/lifecycleService.js';

export const notificationsRouter = Router();

notificationsRouter.get('/', requireAuth, (req, res) => {
  runLifecycleSweep();
  const db = getDb();
  const rows = db
    .prepare(`
      SELECT id, type, title, body, link_path, metadata_json, is_read, created_at
      FROM notifications
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 60
    `)
    .all(req.user!.id) as {
    id: string;
    type: string;
    title: string;
    body: string;
    link_path: string;
    metadata_json: string;
    is_read: number;
    created_at: string;
  }[];

  const unreadCount = rows.filter((r) => !r.is_read).length;

  res.json({
    unreadCount,
    notifications: rows.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      body: r.body,
      linkPath: r.link_path,
      isRead: Boolean(r.is_read),
      createdAt: r.created_at,
    })),
  });
});

notificationsRouter.post('/:id/read', requireAuth, (req, res) => {
  const db = getDb();
  db.prepare(`UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`).run(
    String(req.params.id),
    req.user!.id
  );
  res.json({ ok: true });
});

notificationsRouter.post('/read-all', requireAuth, (req, res) => {
  const db = getDb();
  db.prepare(`UPDATE notifications SET is_read = 1 WHERE user_id = ?`).run(req.user!.id);
  res.json({ ok: true });
});
