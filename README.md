# پیداش (Peydash) — سامانه مکان‌محور یافتن اشیای گمشده شهر تهران

**پیداش** یک وب‌اپلیکیشن عملیاتی، امن و مکان‌محور (مخصوص شهر تهران) برای اتصال ایمن میان فرد گم‌کننده و فرد یابنده است؛ بدون افشای شماره تماس یا نشانی منزل، با احراز مالکیت از طریق ۳ پرسش محرمانه و تحویل امن با کد یک‌بارمصرف و رسید دیجیتال.

## ساختار فنی و ماژولار پروژه

```text
├── client/   # React 19 + TypeScript + Vite + Tailwind CSS v4 (RTL کامل، فونت وزیرمتن، نقشه Leaflet تهران)
├── server/   # Node.js + Express 5 + TypeScript + SQLite (با اسکیما آماده مهاجرت به PostgreSQL/Supabase) + Sharp
└── storage/  # فضای ذخیره‌سازی تصاویر، پیش‌نمایش‌های محوشده در سرور و داده‌های نمونه مجزا
```

### اجرای پروژه

```bash
# نصب وابستگی‌ها
npm --prefix server install
npm --prefix client install

# بیلد کامل کلاینت و سرور
npm run build

# اجرای نسخه یکپارچه روی پورت 3000 (API + Frontend)
npm run start

# اجرای تست‌های یکپارچه و امنیتی (End-to-End)
npm run test:api
```

### جداسازی داده‌های نمونه از داده‌های واقعی
- داده‌های آزمایشی شهر تهران تنها در ماژول `server/src/seed/demoData.ts` تعریف شده‌اند و در دیتابیس با فلگ `is_demo = 1` و در پوشه مجزای `storage/demo/` ذخیره می‌شوند.
- با تنظیم `SEED_DEMO_DATA=false` در محیط تولید، سامانه بدون داده‌های نمونه اجرا می‌شود.

### متغیرهای محیطی برای محیط تولید (Production)
- `PORT`: پورت سرور (پیش‌فرض `3000`)
- `APP_SECRET`: کلید امضا و رمزنگاری AES-256-GCM / HMAC (حداقل ۳۲ کاراکتر)
- `SMS_PROVIDER`: `sandbox` یا `kavenegar`
- `KAVENEGAR_API_KEY`: کلید API سرویس پیامکی کاوه‌نگار
- `VITE_MAP_TILE_URL`: آدرس تایل نقشه ایرانی (نشان / مپ / سیدارمپس)
- `server/src/db/schema.postgres.sql`: فایل مایگریشن آماده برای PostgreSQL / Supabase
