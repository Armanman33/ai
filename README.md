# چی‌کجا (ChikojA) — سامانه مکان‌محور یافتن اشیای گمشده شهر تهران

**چی‌کجا** یک وب‌اپلیکیشن عملیاتی، امن و مکان‌محور (مخصوص شهر تهران) برای اتصال ایمن میان فرد گم‌کننده و فرد یابنده است؛ بدون افشای شماره تماس یا نشانی منزل، با احراز مالکیت از طریق ۳ پرسش محرمانه و تحویل امن با کد یک‌بارمصرف و رسید دیجیتال.

## ساختار فنی و ماژولار پروژه

```text
├── client/   # React 19 + TypeScript + Vite + Tailwind CSS v4 (RTL کامل، فونت وزیرمتن، نقشه Leaflet تهران)
├── server/   # Node.js + Express 5 + TypeScript + SQLite (با اسکیما آماده PostgreSQL/Supabase) + Sharp + لایه SEO
├── deploy/   # فایل‌های آماده استقرار VPS (Nginx + Systemd + PM2)
└── storage/  # فضای ذخیره‌سازی runtime (خارج از Git؛ در Production خارج از Web Root)
```

### اجرای پروژه

```bash
# نصب وابستگی‌ها
npm run install:all

# بیلد کامل کلاینت و سرور
npm run build

# اجرای نسخه یکپارچه روی پورت 3000 (API + Frontend)
npm run start

# اجرای محیط Production
npm run start:prod

# اجرای تست‌های یکپارچه، امنیتی و SEO (End-to-End)
npm run test:api
```

### مستندات استقرار VPS، امنیت و SEO

- **`.env.example`**: الگوی کامل متغیرهای محیطی برای جداسازی Development و Production (بدون ذخیره کلید در Git).
- **`DEPLOYMENT.md`**: راهنمای جامع نصب و راه‌اندازی روی Ubuntu 24.04 LTS، فایروال، Systemd/PM2، Nginx، SSL و به‌روزرسانی ایمن.
- **`PRODUCTION_CHECKLIST.md`**: چک‌لیست کنترل امنیتی، حریم خصوصی، VPS و سرویس‌های خارجی پیش از انتشار عمومی.
- **`SEO.md`**: مستندات ساختار SEO فنی، سیاست صفحات عمومی و خصوصی (`noindex` / `sitemap.xml` / `robots.txt`) و راهنمای Google Search Console.

### جداسازی داده‌های نمونه از داده‌های واقعی
- داده‌های آزمایشی شهر تهران تنها در ماژول `server/src/seed/demoData.ts` تعریف شده‌اند و در دیتابیس با فلگ `is_demo = 1` و در پوشه مجزای `storage/demo/` ذخیره می‌شوند.
- در محیط `NODE_ENV=production` مقدار `SEED_DEMO_DATA` به‌صورت پیش‌فرض `false` است تا داده‌های نمونه وارد محیط واقعی نشوند.
