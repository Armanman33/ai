import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import { CLIENT_DIST_DIR, CONFIG } from './config.js';
import { getDb } from './db/database.js';
import { attachUser } from './middleware/auth.js';
import { alertsRouter } from './routes/alerts.js';
import { authRouter } from './routes/auth.js';
import { chatRouter } from './routes/chat.js';
import { claimsRouter } from './routes/claims.js';
import { deliveriesRouter } from './routes/deliveries.js';
import { itemsRouter } from './routes/items.js';
import { metaRouter } from './routes/meta.js';
import { notificationsRouter } from './routes/notifications.js';
import { safetyRouter } from './routes/safety.js';
import { ensureDemoDataSeeded } from './seed/demoData.js';
import { startLifecycleScheduler } from './services/lifecycleService.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);

  // Basic security headers (while allowing iframe preview embedding)
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(attachUser);

  // API routes
  app.use('/api', metaRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/items', itemsRouter);
  app.use('/api/alerts', alertsRouter);
  app.use('/api/claims', claimsRouter);
  app.use('/api/claims', chatRouter);
  app.use('/api/deliveries', deliveriesRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/safety', safetyRouter);

  // API 404 handler
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'مسیر درخواست‌شده یافت نشد.' });
  });

  // Serve built React frontend in production / unified preview mode
  if (fs.existsSync(CLIENT_DIST_DIR)) {
    app.use(express.static(CLIENT_DIST_DIR, { maxAge: '1h', index: false }));
    app.get('{*splat}', (_req, res) => {
      res.sendFile(path.join(CLIENT_DIST_DIR, 'index.html'));
    });
  }

  // Centralized error handler (including multer file size / type errors)
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message =
      err instanceof Error
        ? err.message
        : 'خطای غیرمنتظره‌ای در سرور رخ داد. لطفاً کمی بعد دوباره تلاش کنید.';
    const status = message.includes('File too large') ? 413 : 400;
    res.status(status).json({
      error: message.includes('File too large') ? 'حجم تصویر نباید بیشتر از ۶ مگابایت باشد.' : message,
    });
  });

  return app;
}

async function bootstrap() {
  getDb();
  await ensureDemoDataSeeded();
  startLifecycleScheduler();

  const app = createApp();
  app.listen(CONFIG.PORT, CONFIG.HOST, () => {
    console.log(`چی‌کجا (ChikojA) server listening on http://${CONFIG.HOST}:${CONFIG.PORT}`);
  });
}

// Only auto-start when run directly (not when imported by integration tests)
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]).includes('index');
if (isDirectRun) {
  bootstrap().catch((err) => {
    console.error('Fatal startup error:', err);
    process.exit(1);
  });
}
