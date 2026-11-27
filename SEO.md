# مستندات جامع SEO فنی و محتوایی «چی‌کجا» (ChikojA)

این سند ساختار پیاده‌سازی‌شده سئو، سیاست تفکیک صفحات عمومی و خصوصی، مدیریت Sitemap و متادیتا، بهینه‌سازی سرعت و راهنمای کامل اتصال به **Google Search Console** را توضیح می‌دهد.

---

## ۱. رویکرد معماری SEO در «چی‌کجا»

به‌دلیل ساختار React 19 + Vite (SPA)، سرو کردن یک `index.html` ثابت برای همه مسیرها باعث می‌شود خزنده‌های موتورهای جست‌وجو متادیتای یکسان، بدنه خالی و خطاهای Soft-404 ببینند.

برای حل اصولی این مسئله **بدون تغییر سنگین معماری و کاملاً سازگار با استقرار روی VPS**، یک لایه سبک Server-Side SEO Enrichment در Express (`server/src/seo/seoMiddleware.ts`) پیاده‌سازی شده است که:

1. برای هر مسیر HTML به‌صورت پویا `<title>`، `<meta name="description">`، `<link rel="canonical">`، `<meta name="robots">`، متاتگ‌های **Open Graph (`fa_IR`)** و **Twitter Card** و داده‌های ساختاریافته **Schema.org (JSON-LD)** را پیش از ارسال در `<head>` تزریق می‌کند.
2. محتوای متنی معنادار و استاندارد (شامل `H1`، توضیحات فارسی و لینک‌های داخلی) را درون `<div id="root">` رندر می‌کند تا خزنده‌ها حتی بدون اجرای جاوااسکریپت محتوای واقعی صفحه را بخوانند و هنگام بالا آمدن React جایگزین شود.
3. برای مسیرهای نامعتبر و آگهی‌های ناموجود کد وضعیت واقعی **HTTP 404** برمی‌گرداند (جلوگیری کامل از Soft-404).
4. مسیرهای دارای اسلش انتهایی اضافی (مثل `/lost/`) را با **301 Permanent Redirect** به نسخه Canonical (`/lost`) هدایت می‌کند.
5. هنگام جابه‌جایی کاربر درون SPA نیز هوک `usePageSeo` (`client/src/lib/seo.ts`) عنوان، توضیحات، Canonical و `robots` را به‌صورت زنده همگام نگه می‌دارد.

---

## ۲. نقشه URLها: صفحات عمومی (Indexable) در برابر صفحات خصوصی (Noindex)

| مسیر URL | وضعیت ایندکس | حضور در Sitemap | دلیل و سیاست حریم خصوصی |
| --- | --- | --- | --- |
| `/` | `index, follow` | بله | صفحه اصلی چی‌کجا (تهران) همراه با `WebSite`، `Organization` و `FAQPage` مطابق با FAQ قابل مشاهده |
| `/lost` | `index, follow` | بله | جست‌وجوی اشیای گمشده در تهران و ثبت هشدار ۵ روزه |
| `/found` | `index, follow` | بله | ثبت سریع شیء پیدا شده در تهران |
| `/category/:slug` (۸ دسته تهران) | `index, follow` | بله | صفحات دسته‌بندی اختصاصی با محتوای فارسی مفید و راهنمای امنیتی هر دسته (`electronics`، `bag`، `keys`، `id-documents`، `bank-cards`، `jewelry-watch`، `clothing`، `other`) |
| `/items/:id` (فعال، واقعی و غیرحساس) | `index, follow` | بله | فقط عنوان کوتاه، محدوده تقریبی تهران و دسته‌بندی؛ بدون مختصات دقیق، بدون عکس واضح، بدون شماره تماس و بدون سؤالات/پاسخ‌های محرمانه |
| `/items/:id` (**مدارک شناسایی** و **کارت بانکی**) | `noindex, nofollow, noarchive` | **خیر** | حفاظت کامل از اطلاعات هویتی و مالی شهروندان |
| `/items/:id` (دمو، منقضی، تحویل‌شده یا حذف‌شده) | `noindex, nofollow, noarchive` | **خیر** | جلوگیری از ایندکس محتوای غیرواقعی یا منقضی |
| `/auth`، `/my-ads`، `/my-alerts`، `/requests`، `/claims/:id`، `/notifications`، `/profile` | `noindex, nofollow, noarchive` + `X-Robots-Tag` | **خیر** | صفحات خصوصی کاربری؛ علاوه بر `noindex` و `robots.txt`، در سطح بک‌اند با احراز هویت (`requireAuth`) محافظت می‌شوند |
| `/api/*` و `/api/items/:id/image` | هدر `X-Robots-Tag: noindex, nofollow, noarchive` | **خیر** | تصاویر تار و واضح فقط با امضای HMAC زمانی ارائه می‌شوند و نسخه اصلی هرگز عمومی نیست |
| هر مسیر نامعتبر دیگر | **HTTP 404** + `noindex, nofollow` | **خیر** | جلوگیری از خطای Soft-404 |

---

## ۳. مدیریت `robots.txt` و `sitemap.xml`

- **`GET /robots.txt`**: به‌صورت پویا بر اساس `PUBLIC_SITE_URL` تولید می‌شود، مسیرهای عمومی را مجاز و مسیرهای `/api/`، `/auth`، `/my-ads`، `/my-alerts`، `/requests`، `/claims/`، `/notifications` و `/profile` را `Disallow` می‌کند و آدرس `Sitemap` را معرفی می‌نماید.
- **`GET /sitemap.xml`**: شامل صفحات اصلی، ۸ صفحه دسته‌بندی تهران و فقط آگهی‌های **فعال، غیرمنقضی، غیردمو (`is_demo = 0`) و غیرحساس** است.
- **`GET /sitemap-index.xml`**: برای مقیاس‌پذیری آینده، نقشه سایت را به دو فایل مستقل `sitemap-static.xml` و `sitemap-items.xml` تفکیک کرده است.

---

## ۴. بهینه‌سازی سرعت و Core Web Vitals

- **Code Splitting و Lazy Loading**: صفحه اصلی (`/`) به‌صورت مستقیم بارگذاری می‌شود و صفحات ثانویه و سنگین نقشه (`Leaflet`) با `React.lazy` و `manualChunks` در Vite جدا شده‌اند تا حجم جاوااسکریپت اولیه و معیارهای LCP و INP بهینه بماند.
- **فونت و تصاویر**: فونت `Vazirmatn` به‌صورت محلی (self-hosted WOFF2) باندل شده است (بدون وابستگی به فونت بیرونی و بدون تأخیر شبکه). تصاویر با `Sharp` فشرده (`progressive JPEG`)، دارای `alt` توصیفی فارسی، `loading="lazy"`، `decoding="async"` و نسبت ابعاد مشخص برای جلوگیری از CLS هستند.
- **Cache و فشرده‌سازی**: فایل‌های هش‌شده `/assets/*` با `Cache-Control: public, max-age=31536000, immutable` و فشرده‌سازی Gzip در `deploy/nginx-chikoja.conf` سرو می‌شوند.

---

## ۵. راهنمای اتصال به Google Search Console و ثبت Sitemap

پس از راه‌اندازی نهایی سایت روی دامنه اصلی با **HTTPS**:

### گام ۱: افزودن سایت در Google Search Console
1. وارد [Google Search Console](https://search.google.com/search-console) شوید.
2. گزینه **Add property** را انتخاب کنید (روش پیشنهادی: **Domain property** با رکورد DNS TXT، یا **URL prefix** به شکل `https://chikoja.ir`).

### گام ۲: تأیید مالکیت سایت (روش استاندارد و امن)
چی‌کجا از هر دو روش زیر از طریق متغیر محیطی (بدون ذخیره کد در گیت) پشتیبانی می‌کند:
- **روش الف — تگ HTML Meta (ساده‌ترین روش):**
  1. در Search Console روش **HTML tag** را انتخاب کنید و فقط مقدار داخل `content="..."` را کپی کنید.
  2. آن را در فایل `.env` روی سرور وارد کنید:
     ```env
     GOOGLE_SITE_VERIFICATION=کد_تایید_ارائه_شده_توسط_گوگل
     ```
  3. سرویس را ری‌استارت کنید (`sudo systemctl restart chikoja.service`) و در Search Console روی **Verify** بزنید.
- **روش ب — فایل تأیید HTML:**
  1. نام دقیق فایل ارائه‌شده (مثلاً `google1234567890abcdef.html`) را در `.env` قرار دهید:
     ```env
     GOOGLE_SITE_VERIFICATION_FILE=google1234567890abcdef.html
     ```
  2. سرویس را ری‌استارت کرده و تأیید کنید.

### گام ۳: ثبت Sitemap
1. در منوی سمت چپ Search Console وارد بخش **Sitemaps** شوید.
2. مقدار `sitemap.xml` (یا در مقیاس بزرگ `sitemap-index.xml`) را وارد کرده و روی **Submit** کلیک کنید.
3. پس از چند دقیقه وضعیت باید به **Success** تغییر کند و تعداد URLهای کشف‌شده نمایش داده شود.

### گام ۴: پایش مستمر پس از انتشار
- **Indexing → Pages (Coverage):** بررسی کنید صفحات عمومی در وضعیت Indexed باشند و هیچ صفحه خصوصی، خطای 5xx یا Soft-404 در گزارش خطاها ظاهر نشده باشد.
- **URL Inspection:** آدرس `/`، `/lost` و یکی از صفحات `/category/...` را با گزینه **Test Live URL** بررسی کنید تا رندر موبایل، Canonical و دسترسی گوگل‌بات تأیید شود.
- **Experience → Core Web Vitals:** پس از جمع‌آوری داده‌های واقعی کاربران (CrUX)، معیارهای LCP، INP و CLS را در موبایل و دسکتاپ رصد کنید.

---

## ۶. نکته مهم و شفاف درباره نتایج SEO

پیاده‌سازی زیرساخت فنی SEO تضمینی برای کسب رتبه خاص یا ایندکس شدن فوری و قطعی تمام صفحات در گوگل نیست. وضعیت واقعی ایندکس و جایگاه سایت تنها پس از انتشار روی دامنه اصلی با HTTPS، ارسال Sitemap در Google Search Console و بر اساس کیفیت محتوای واقعی، تعامل کاربران، رقابت در کلیدواژه‌های تهران و عملکرد واقعی سرور قابل ارزیابی است.
