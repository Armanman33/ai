# راهنمای جامع استقرار «چی‌کجا» (ChikojA) روی VPS اوبونتو ۲۴.۰۴

این راهنما تمام مراحل نصب، ایمن‌سازی، اجرا و به‌روزرسانی سامانه **«چی‌کجا»** را روی سرور مجازی **Ubuntu 24.04 LTS** از صفر تا صد توضیح می‌دهد.

---

## ۱. پیش‌نیازهای سرور (VPS)

- سیستم‌عامل: **Ubuntu 24.04 LTS** (حداقل ۱ هسته CPU، ۱ تا ۲ گیگابایت RAM، ۲۰ گیگابایت دیسک SSD)
- دامنه ثبت‌شده (مثال: `chikoja.ir`) با رکورد DNS نوع `A` متصل به IP سرور (برای `@` و `www`)
- دسترسی SSH با کاربر دارای مجوز `sudo`

---

## ۲. آماده‌سازی اولیه سیستم و فایروال (UFW)

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git nginx certbot python3-certbot-nginx ufw
```

### تنظیم فایروال (فقط SSH، HTTP و HTTPS باز باشند)

پورت داخلی Node.js (`3000`) روی `127.0.0.1` بسته می‌ماند و نباید به اینترنت باز شود:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status verbose
```

---

## ۳. نصب Node.js 22 LTS و ایجاد کاربر اختصاصی سرویس

پروژه از ماژول داخلی `node:sqlite` در Node.js 22 و کتابخانه `sharp` استفاده می‌کند:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # باید v22.x باشد
npm -v
```

ایجاد کاربر غیرریشه (`chikoja`) و پوشه‌های امن برنامه و ذخیره‌سازی:

```bash
sudo useradd --system --home /opt/chikoja --shell /usr/sbin/nologin chikoja
sudo mkdir -p /opt/chikoja /var/lib/chikoja/storage /var/log/chikoja
sudo chown -R chikoja:chikoja /opt/chikoja /var/lib/chikoja /var/log/chikoja
sudo chmod 750 /var/lib/chikoja/storage
```

> **نکته امنیتی فایل‌های آپلودشده:** مسیر `/var/lib/chikoja/storage` کاملاً خارج از مسیر فایل‌های عمومی وب (Nginx Web Root) قرار دارد. تصاویر اصلی و نسخه‌های تار‌شده فقط از طریق اندپوینت امضاشده `/api/items/:id/image` توسط سرور Express ارائه می‌شوند و دسترسی مستقیم از Nginx مسدود است.

---

## ۴. دریافت سورس‌کد، تنظیم `.env` و Build

```bash
sudo -u chikoja git clone https://github.com/Armanman33/ai.git /opt/chikoja
cd /opt/chikoja
sudo -u chikoja cp .env.example .env
sudo chmod 600 /opt/chikoja/.env
```

تولید کلید رمزنگاری امن برای `APP_SECRET`:

```bash
openssl rand -hex 48
```

فایل `/opt/chikoja/.env` را ویرایش کنید و حداقل مقادیر زیر را دقیق تنظیم نمایید:

```env
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
TRUST_PROXY=true
PUBLIC_SITE_URL=https://chikoja.ir
ALLOW_IFRAME_EMBEDDING=false
APP_SECRET=<خروجی دستور openssl rand -hex 48>
STORAGE_DIR=/var/lib/chikoja/storage
DB_PATH=/var/lib/chikoja/storage/ChikojA.db
SEED_DEMO_DATA=false
SMS_PROVIDER=kavenegar
KAVENEGAR_API_KEY=<کلید واقعی پنل پیامک کاوه‌نگار>
ALLOW_SANDBOX_SMS_IN_PROD=false
OTP_COOLDOWN_SECONDS=45
```

> **جداسازی Development و Production:** در محیط `NODE_ENV=production` به‌طور خودکار داده‌های نمونه غیرفعال (`SEED_DEMO_DATA=false`)، ارسال کد OTP آزمایشی مسدود و هدرهای امنیتی سخت‌گیرانه (`X-Frame-Options: SAMEORIGIN` و `HSTS`) فعال می‌شوند.

### نصب وابستگی‌ها، Build و اجرای تست‌ها

```bash
cd /opt/chikoja
sudo -u chikoja npm run install:all
sudo -u chikoja npm run build
sudo -u chikoja npm run test:api
```

در صورت نیاز به سرور تایل نقشه رسمی داخل ایران، هنگام بیلد کلاینت متغیر `VITE_MAP_TILE_URL` را مقداردهی کنید:

```bash
sudo -u chikoja VITE_MAP_TILE_URL="https://YOUR_IRAN_TILE_SERVER/{z}/{x}/{y}.png" npm run build:client
```

---

## ۵. اجرای دائمی Node.js و راه‌اندازی خودکار پس از Restart

می‌توانید از **Systemd (پیشنهادی برای Ubuntu 24.04)** یا **PM2** استفاده کنید (فقط یکی از این دو را فعال کنید):

### روش اول (پیشنهادی): Systemd

```bash
sudo cp /opt/chikoja/deploy/chikoja.service /etc/systemd/system/chikoja.service
sudo systemctl daemon-reload
sudo systemctl enable --now chikoja.service
sudo systemctl status chikoja.service
```

بررسی سلامت سرویس داخلی:

```bash
curl -sS http://127.0.0.1:3000/api/health
```

خروجی سالم باید شامل `"ok":true` و `"checks":{"database":"ok","storage":"ok"}` باشد.

مشاهده لاگ‌های زنده سرویس:

```bash
sudo journalctl -u chikoja.service -f
```

### روش دوم: PM2

```bash
sudo npm install -g pm2
cd /opt/chikoja
sudo -u chikoja pm2 start deploy/ecosystem.config.cjs --env production
sudo -u chikoja pm2 save
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u chikoja --hp /opt/chikoja
```

> **مهم برای SQLite:** به‌دلیل معماری تک‌نویسنده (WAL mode) در SQLite، تعداد نمونه (instances) حتماً باید `1` باقی بماند. در صورت نیاز به چند نمونه هم‌زمان در آینده، اسکیمای `server/src/db/schema.postgres.sql` برای مهاجرت به PostgreSQL آماده است.

---

## ۶. تنظیم Nginx Reverse Proxy، دامنه و گواهی SSL (HTTPS)

۱. کپی فایل تنظیمات Nginx و جایگزینی نام دامنه واقعی خود به‌جای `chikoja.ir`:

```bash
sudo cp /opt/chikoja/deploy/nginx-chikoja.conf /etc/nginx/sites-available/chikoja.conf
sudo nano /etc/nginx/sites-available/chikoja.conf
sudo ln -sf /etc/nginx/sites-available/chikoja.conf /etc/nginx/sites-enabled/chikoja.conf
sudo rm -f /etc/nginx/sites-enabled/default
```

۲. ابتدا یک بار برای صدور گواهی SSL با Certbot (در صورتی که فایل گواهی هنوز وجود ندارد، می‌توانید موقتاً فقط بلوک پورت ۸۰ را نگه دارید یا از حالت `--standalone` پیش از فعال کردن بلوک ۴۴۳ استفاده کنید):

```bash
sudo mkdir -p /var/www/certbot
sudo certbot certonly --webroot -w /var/www/certbot -d chikoja.ir -d www.chikoja.ir
```

۳. بررسی صحت پیکربندی Nginx و بارگذاری مجدد:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

۴. بررسی تمدید خودکار گواهی SSL:

```bash
sudo systemctl status certbot.timer
sudo certbot renew --dry-run
```

---

## ۷. روند به‌روزرسانی ایمن بدون اختلال غیرضروری

برای انتشار نسخه جدید کد روی VPS با حداقل وقفه (چند ثانیه ری‌استارت تمیز با Graceful Shutdown):

```bash
cd /opt/chikoja

# ۱. دریافت آخرین نسخه مجاز
sudo -u chikoja git fetch origin
sudo -u chikoja git checkout main
sudo -u chikoja git pull origin main

# ۲. نصب وابستگی‌ها و Build قبل از ری‌استارت سرویس فعال
sudo -u chikoja npm run install:all
sudo -u chikoja npm run build

# ۳. اجرای تست‌های ایزوله (در پوشه موقت، بدون دست‌کاری دیتابیس اصلی)
sudo -u chikoja npm run test:api

# ۴. ری‌استارت تمیز (SIGTERM -> بستن امن اتصالات و WAL Checkpoint)
sudo systemctl restart chikoja.service

# ۵. تأیید سلامت سرویس پس از ری‌استارت
curl -fsS http://127.0.0.1:3000/api/health
```

---

## ۸. وضعیت شفاف سرویس‌های بیرونی در نسخه فعلی

| قابلیت | وضعیت فعلی در کد | نیازمندی برای عملکرد واقعی در Production |
| --- | --- | --- |
| احراز هویت OTP، نشست، قفل ۳ اشتباه، چت، تحویل، رسید دیجیتال | **عملیاتی و واقعی** | تنظیم `.env` و `APP_SECRET` |
| پردازش و تار کردن واقعی تصاویر (Sharp + EXIF strip + امضای HMAC) | **عملیاتی و واقعی** | مجوز نوشتن در `STORAGE_DIR` |
| پاک‌سازی خودکار آگهی‌های قدیمی، تصاویر و فشرده‌سازی دیسک SQLite | **عملیاتی و خودکار (هر ۶۰ ثانیه)** | قابل تنظیم با متغیرهای `*_PURGE_DAYS` و `LOG_RETENTION_DAYS` در `.env` |
| SEO تکنیکال (`robots.txt`، `sitemap.xml`، متای پویا، Canonical، ۴۰۴ واقعی) | **عملیاتی و واقعی** | تنظیم `PUBLIC_SITE_URL` و ثبت در Search Console |
| ارسال پیامک واقعی (SMS) | **آداپتور کاوه‌نگار آماده است / حالت پیش‌فرض Sandbox** | خرید سرویس و تنظیم `SMS_PROVIDER=kavenegar` و `KAVENEGAR_API_KEY` |
| کاشی نقشه تهران (Map Tiles) | **OpenStreetMap پیش‌فرض + Fallback برداری** | در صورت نیاز به سرویس داخلی ایران، تنظیم `VITE_MAP_TILE_URL` |
| اعلان مرورگر (Web Push) | **اعلان درون‌برنامه‌ای واقعی + ذخیره مجوز کاربر** | برای Push پس‌زمینه خارج از سایت، نیاز به Service Worker و کلیدهای VAPID در آینده |
| پیک موتوری و شبکه نقاط امن واقعی تهران | **گردش‌کار کامل با کد یک‌بارمصرف و رسید دیجیتال** | برای اعزام خودکار پیک یا پنل اپراتور مترو، نیاز به قرارداد و اتصال API بیرونی در آینده |
