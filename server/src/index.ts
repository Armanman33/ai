import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import { CLIENT_DIST_DIR, CONFIG } from './config.js';
import { closeDb, getDb } from './db/database.js';
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
import { seoRouter, serveSeoAwareSpa } from './seo/seoMiddleware.js';
import { startLifecycleScheduler } from './services/lifecycleService.js';
import { AppError, formatErrorResponse } from './utils/errors.js';
import { logger } from './utils/logger.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (CONFIG.TRUST_PROXY) {
    app.set('trust proxy', CONFIG.TRUST_PROXY);
  }

  // Security headers (production hardened while preserving iframe preview when configured)
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
    if (!CONFIG.ALLOW_IFRAME_EMBEDDING) {
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    }
    if (CONFIG.IS_PRODUCTION && (req.secure || req.headers['x-forwarded-proto'] === 'https')) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  // Lightweight privacy-safe operational request logger (errors & slow requests)
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const durationMs = Date.now() - start;
      if (res.statusCode >= 500 || durationMs > 2000) {
        logger.warn('http_request_attention', {
          method: req.method,
          path: req.path,
          status: res.statusCode,
          durationMs,
        });
      }
    });
    next();
  });

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  // Prevent search engines from ever indexing API endpoints
  app.use('/api', (_req, res, next) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    next();
  });

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
    res.status(404).json(formatErrorResponse('مسیر درخواست‌شده یافت نشد.', 'NOT_FOUND'));
  });

  // Technical SEO endpoints (robots.txt, sitemap.xml, sitemap-index.xml, GSC verification)
  app.use(seoRouter);

  // Serve built React frontend with immutable caching on hashed assets + SEO-aware HTML fallback
  if (fs.existsSync(CLIENT_DIST_DIR)) {
    const assetsDir = path.join(CLIENT_DIST_DIR, 'assets');
    if (fs.existsSync(assetsDir)) {
      app.use(
        '/assets',
        express.static(assetsDir, {
          maxAge: '1y',
          immutable: true,
          fallthrough: false,
        })
      );
    }
    app.use(
      express.static(CLIENT_DIST_DIR, {
        maxAge: '1d',
        index: false,
      })
    );
    app.get('{*splat}', serveSeoAwareSpa);
  }

  // Centralized error handler (strictly hides internal stack/DB details in production)
  app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof AppError) {
      res.status(err.status).json(formatErrorResponse(err.message, err.code));
      return;
    }

    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json(formatErrorResponse('حجم تصویر نباید بیشتر از ۶ مگابایت باشد.', 'FILE_TOO_LARGE'));
        return;
      }
      res.status(400).json(formatErrorResponse('خطا در بارگذاری فایل تصویر.', 'UPLOAD_ERROR'));
      return;
    }

    if (err instanceof SyntaxError && 'status' in err && (err as { status?: number }).status === 400) {
      res.status(400).json(formatErrorResponse('فرمت درخواست JSON نامعتبر است.', 'INVALID_JSON'));
      return;
    }

    const rawMsg = err instanceof Error ? err.message : 'Unexpected server error';
    const isClientUploadFilterError = rawMsg.includes('فقط فرمت‌های تصویر');
    if (isClientUploadFilterError) {
      res.status(400).json(formatErrorResponse(rawMsg, 'INVALID_FILE_TYPE'));
      return;
    }

    logger.error('unhandled_server_error', {
      method: req.method,
      path: req.path,
      errorMessage: rawMsg,
    });

    const safeMessage = CONFIG.IS_PRODUCTION
      ? 'خطای غیرمنتظره‌ای در سرور رخ داد. لطفاً کمی بعد دوباره تلاش کنید.'
      : rawMsg;
    res.status(500).json(formatErrorResponse(safeMessage, 'INTERNAL_SERVER_ERROR'));
  });

  return app;
}

async function bootstrap() {
  getDb();
  await ensureDemoDataSeeded();
  startLifecycleScheduler();

  const app = createApp();
  const server = app.listen(CONFIG.PORT, CONFIG.HOST, () => {
    logger.info('server_started', {
      name: 'چی‌کجا (ChikojA)',
      host: CONFIG.HOST,
      port: CONFIG.PORT,
      env: CONFIG.NODE_ENV,
      smsProvider: CONFIG.SMS_PROVIDER,
      seedDemo: CONFIG.SEED_DEMO_DATA,
    });
    console.log(`چی‌کجا (ChikojA) server listening on http://${CONFIG.HOST}:${CONFIG.PORT}`);
  });

  // Graceful shutdown for PM2 / Systemd / VPS restarts (zero DB corruption)
  const shutdown = (signal: string) => {
    logger.info('server_shutting_down', { signal });
    server.close(() => {
      closeDb();
      process.exit(0);
    });
    setTimeout(() => {
      closeDb();
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// Only auto-start when run directly (not when imported by integration tests)
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]).includes('index');
if (isDirectRun) {
  bootstrap().catch((err) => {
    logger.error('fatal_startup_error', { errorMessage: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  });
}
