import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ROOT_DIR = path.resolve(__dirname, '..', '..');
export const STORAGE_DIR = process.env.STORAGE_DIR || path.join(ROOT_DIR, 'storage');
export const UPLOADS_DIR = path.join(STORAGE_DIR, 'uploads');
export const PREVIEWS_DIR = path.join(STORAGE_DIR, 'previews');
export const DEMO_MEDIA_DIR = path.join(STORAGE_DIR, 'demo');
export const DB_PATH = process.env.DB_PATH || path.join(STORAGE_DIR, 'ChikojA.db');
export const CLIENT_DIST_DIR = path.join(ROOT_DIR, 'client', 'dist');

for (const dir of [STORAGE_DIR, UPLOADS_DIR, PREVIEWS_DIR, DEMO_MEDIA_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';

function loadOrCreateSecret(): string {
  if (process.env.APP_SECRET) {
    if (process.env.APP_SECRET.length < 32) {
      throw new Error('APP_SECRET must be at least 32 characters long.');
    }
    return process.env.APP_SECRET;
  }
  const secretPath = path.join(STORAGE_DIR, '.app_secret');
  if (fs.existsSync(secretPath)) {
    const existing = fs.readFileSync(secretPath, 'utf8').trim();
    if (existing.length >= 32) return existing;
  }
  const fresh = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(secretPath, fresh, { mode: 0o600 });
  return fresh;
}

function normalizeSiteUrl(raw: string | undefined): string {
  const fallback = 'https://chikoja.ir';
  if (!raw || !raw.trim()) return fallback;
  return raw.trim().replace(/\/+$/, '');
}

function parsePositiveNumber(raw: string | undefined, fallback: number, min = 0): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < min) return fallback;
  return parsed;
}

const seedDemoEnv = process.env.SEED_DEMO_DATA;
// In production, demo seeding defaults to OFF unless explicitly set to 'true'.
// In development, demo seeding defaults to ON unless explicitly set to 'false'.
const SEED_DEMO_DATA = IS_PRODUCTION ? seedDemoEnv === 'true' : seedDemoEnv !== 'false';

export const CONFIG = {
  PORT: Number(process.env.PORT || 3000),
  HOST: process.env.HOST || '0.0.0.0',
  NODE_ENV,
  IS_PRODUCTION,
  TRUST_PROXY: process.env.TRUST_PROXY !== 'false' ? 1 : false,
  PUBLIC_SITE_URL: normalizeSiteUrl(process.env.PUBLIC_SITE_URL),
  ALLOW_IFRAME_EMBEDDING: process.env.ALLOW_IFRAME_EMBEDDING
    ? process.env.ALLOW_IFRAME_EMBEDDING === 'true'
    : !IS_PRODUCTION,
  GOOGLE_SITE_VERIFICATION: (process.env.GOOGLE_SITE_VERIFICATION || '').trim(),
  APP_SECRET: loadOrCreateSecret(),
  SMS_PROVIDER: process.env.SMS_PROVIDER || 'sandbox', // 'sandbox' | 'kavenegar'
  ALLOW_SANDBOX_SMS_IN_PROD: process.env.ALLOW_SANDBOX_SMS_IN_PROD === 'true',
  KAVENEGAR_API_KEY: process.env.KAVENEGAR_API_KEY || '',
  SEED_DEMO_DATA,

  // Lifecycle & Security rules (strictly per specification)
  FOUND_ITEM_TTL_DAYS: 3,
  LOST_ALERT_TTL_DAYS: 5,
  NEAR_EXPIRY_HOURS: 12,
  MAX_WRONG_OWNERSHIP_ATTEMPTS: 3,
  OTP_EXPIRY_MINUTES: 3,
  OTP_COOLDOWN_SECONDS: Number(process.env.OTP_COOLDOWN_SECONDS ?? (IS_PRODUCTION ? 45 : 0)),
  SESSION_TTL_DAYS: 30,
  MAX_IMAGE_UPLOAD_BYTES: 6 * 1024 * 1024,

  // Automatic retention & disk garbage-collection policies (prevents unbounded disk/DB growth)
  EXPIRED_ITEM_PURGE_DAYS: parsePositiveNumber(process.env.EXPIRED_ITEM_PURGE_DAYS, 7, 1),
  REMOVED_ITEM_PURGE_DAYS: parsePositiveNumber(process.env.REMOVED_ITEM_PURGE_DAYS, 1, 0),
  DELIVERED_ITEM_PURGE_DAYS: parsePositiveNumber(process.env.DELIVERED_ITEM_PURGE_DAYS, 30, 1),
  EXPIRED_ALERT_PURGE_DAYS: parsePositiveNumber(process.env.EXPIRED_ALERT_PURGE_DAYS, 7, 1),
  LOG_RETENTION_DAYS: parsePositiveNumber(process.env.LOG_RETENTION_DAYS, 30, 1),
  ORPHAN_FILE_GRACE_MINUTES: parsePositiveNumber(process.env.ORPHAN_FILE_GRACE_MINUTES, 10, 1),

  // Tehran geographic boundary (strictly Tehran city)
  TEHRAN_BOUNDS: {
    minLat: 35.555,
    maxLat: 35.845,
    minLng: 51.085,
    maxLng: 51.635,
    centerLat: 35.7219,
    centerLng: 51.3347,
  },
} as const;

export type ItemCategory =
  | 'electronics'
  | 'bag'
  | 'keys'
  | 'id_documents'
  | 'bank_cards'
  | 'jewelry_watch'
  | 'clothing'
  | 'other';

export interface CategoryMeta {
  id: ItemCategory;
  slug: string;
  label: string;
  seoTitle: string;
  seoDescription: string;
  seoIntro: string;
  sensitive: boolean;
  safePointOnly: boolean;
  suggestedQuestions: string[];
}

export const CATEGORIES: CategoryMeta[] = [
  {
    id: 'electronics',
    slug: 'electronics',
    label: 'موبایل و لوازم الکترونیکی',
    seoTitle: 'گوشی و لوازم الکترونیکی گمشده و پیدا‌شده در تهران | چی‌کجا',
    seoDescription:
      'جست‌وجو و ثبت موبایل، تبلت، هدفون و لوازم الکترونیکی گمشده یا پیدا‌شده در شهر تهران با احراز مالکیت ۳ پرسشی و تحویل امن در چی‌کجا.',
    seoIntro:
      'اگر گوشی موبایل، هدفون یا لپ‌تاپ خود را در مترو، تاکسی یا خیابان‌های تهران گم کرده‌اید یا وسیله الکترونیکی پیدا کرده‌اید، در چی‌کجا می‌توانید با حفظ حریم خصوصی و بدون نمایش شماره تماس مالک واقعی را شناسایی کنید.',
    sensitive: false,
    safePointOnly: false,
    suggestedQuestions: [
      'رنگ قاب گوشی چیست؟',
      'تصویر پس‌زمینه گوشی چه چیزی است؟',
      'برند یا مدل دقیق گوشی چیست؟',
      'روی صفحه نمایش یا بدنه چه خط و خش یا علامت خاصی وجود دارد؟',
      'نام اپراتور یا زبان منوی دستگاه چیست؟',
    ],
  },
  {
    id: 'bag',
    slug: 'bag',
    label: 'کیف و کوله',
    seoTitle: 'کیف و کوله‌پشتی گمشده و پیدا‌شده در تهران | چی‌کجا',
    seoDescription:
      'پیگیری کیف پول، کیف دوشی و کوله‌پشتی گمشده یا پیدا‌شده در محله‌ها و ایستگاه‌های متروی تهران در سامانه امن چی‌کجا.',
    seoIntro:
      'برای بازیابی کیف پول، کیف دستی یا کوله‌پشتی گمشده در تهران، محدوده تقریبی را روی نقشه انتخاب کنید و پس از پاسخ صحیح به ۳ پرسش محرمانه یابنده، تحویل را با پیک یا نقطه امن هماهنگ کنید.',
    sensitive: false,
    safePointOnly: false,
    suggestedQuestions: [
      'رنگ داخلی کیف چیست؟',
      'چه وسیله خاصی داخل آن وجود دارد؟',
      'یکی از ویژگی‌های ظاهری خاص آن چیست؟',
      'جنس یا برند کیف چیست؟',
      'آیا جاکلیدی، بج یا برچسب خاصی به زیپ آن وصل است؟',
    ],
  },
  {
    id: 'keys',
    slug: 'keys',
    label: 'کلید',
    seoTitle: 'کلید، سوئیچ خودرو و ریموت گمشده در تهران | چی‌کجا',
    seoDescription:
      'یافتن دسته کلید، سوئیچ خودرو و ریموت پارکینگ گمشده و ثبت کلید پیدا‌شده در شهر تهران بدون افشای نشانی منزل.',
    seoIntro:
      'در چی‌کجا برای حفظ امنیت، تصاویر کلیدها پیش از تأیید مالکیت تار نمایش داده می‌شوند و نشانی منزل هرگز برای طرف مقابل افشا نمی‌شود.',
    sensitive: false,
    safePointOnly: false,
    suggestedQuestions: [
      'چند کلید به دسته متصل است؟',
      'جاکلیدی چه رنگی است؟',
      'چه علامت خاصی روی آن وجود دارد؟',
      'آیا ریموت پارکینگ یا تگ آسانسور به آن وصل است؟',
      'شکل یا متن روی جاکلیدی چیست؟',
    ],
  },
  {
    id: 'id_documents',
    slug: 'id-documents',
    label: 'مدارک شناسایی',
    seoTitle: 'مدارک شناسایی گمشده و پیدا‌شده در تهران (تحویل نقطه امن) | چی‌کجا',
    seoDescription:
      'راهنمای پیگیری کارت ملی، گواهینامه، شناسنامه و گذرنامه گمشده یا پیدا‌شده در تهران؛ حفاظت‌شده و منحصراً با تحویل در نقاط امن تهران.',
    seoIntro:
      'برای حفاظت کامل از هویت شهروندان، آگهی‌های مدارک شناسایی در موتورهای جست‌وجو ایندکس نمی‌شوند، تصاویر آن‌ها پیش از تأیید به‌طور کامل پوشانده می‌شوند و تحویل آن‌ها منحصراً از طریق نقاط امن تهران انجام می‌گیرد.',
    sensitive: true,
    safePointOnly: true,
    suggestedQuestions: [
      'نام و نام خانوادگی ثبت‌شده روی مدرک چیست؟',
      'سال تولد یا محل صدور درج‌شده چیست؟',
      'مدرک داخل چه نوع جلد یا کاوری قرار داشت؟',
      'نام پدر درج‌شده روی مدرک چیست؟',
      'سه رقم آخر کد ملی یا شماره مدرک چیست؟',
    ],
  },
  {
    id: 'bank_cards',
    slug: 'bank-cards',
    label: 'کارت بانکی',
    seoTitle: 'کارت بانکی گمشده و پیدا‌شده در تهران (تحویل نقطه امن) | چی‌کجا',
    seoDescription:
      'ثبت و پیگیری امن کارت بانکی پیدا‌شده در تهران با پوشاندن خودکار تصویر و الزام تحویل فقط از طریق نقاط امن چی‌کجا.',
    seoIntro:
      'اطلاعات کارت‌های بانکی حساس است؛ به همین دلیل در چی‌کجا هیچ جزئیاتی از کارت بانکی به‌صورت عمومی منتشر نمی‌شود و تحویل آن منحصراً در نقاط امن معتبر تهران با رسید دیجیتال انجام می‌شود.',
    sensitive: true,
    safePointOnly: true,
    suggestedQuestions: [
      'نام بانک صادرکننده کارت چیست؟',
      'نام دارنده کارت چیست؟',
      'چهار رقم آخر شماره کارت چیست؟',
      'تاریخ انقضای کارت چه ماه و سالی است؟',
      'آیا کارت داخل جلد یا همراه رسید خاصی بود؟',
    ],
  },
  {
    id: 'jewelry_watch',
    slug: 'jewelry-watch',
    label: 'ساعت و زیورآلات',
    seoTitle: 'ساعت مچی و زیورآلات گمشده و پیدا‌شده در تهران | چی‌کجا',
    seoDescription:
      'جست‌وجو و ثبت ساعت مچی، انگشتر و زیورآلات گمشده یا پیدا‌شده در تهران با بررسی مالکیت ۳ پرسشی و تحویل امن با کد یک‌بارمصرف.',
    seoIntro:
      'ساعت مچی و زیورآلات پیدا‌شده در نقاط مختلف تهران را می‌توانید بر اساس محله و زمان تقریبی جست‌وجو کنید و پس از اثبات مالکیت با کد یک‌بارمصرف تحویل بگیرید.',
    sensitive: false,
    safePointOnly: false,
    suggestedQuestions: [
      'برند یا نوشته روی صفحه ساعت چیست؟',
      'رنگ صفحه یا جنس بند آن چیست؟',
      'چه علامت، حکاکی یا آسیب جزئی روی آن وجود دارد؟',
      'قفل یا سگک آن چه مدلی است؟',
    ],
  },
  {
    id: 'clothing',
    slug: 'clothing',
    label: 'پوشاک',
    seoTitle: 'پوشاک و البسه گمشده و پیدا‌شده در تهران | چی‌کجا',
    seoDescription:
      'جست‌وجو و ثبت کت، کفش، عینک و پوشاک گمشده یا پیدا‌شده در مراکز خرید، پارک‌ها و متروی تهران در سامانه چی‌کجا.',
    seoIntro:
      'اگر لباس، کت، عینک یا کفش خود را در پارک‌ها، مراکز خرید یا حمل‌ونقل عمومی تهران جا گذاشته‌اید، محدوده را روی نقشه جست‌وجو کنید یا هشدار ۵ روزه ثبت نمایید.',
    sensitive: false,
    safePointOnly: false,
    suggestedQuestions: [
      'سایز یا برند درج‌شده روی اتیکت چیست؟',
      'رنگ آستر داخلی یا دکمه‌ها چیست؟',
      'آیا وسیله‌ای در جیب آن قرار داشت؟',
      'چه طرح، نوشته یا علامت خاصی روی آن است؟',
    ],
  },
  {
    id: 'other',
    slug: 'other',
    label: 'سایر موارد',
    seoTitle: 'سایر اشیای گمشده و پیدا‌شده در تهران | چی‌کجا',
    seoDescription:
      'جست‌وجو و ثبت سایر وسایل شخصی گمشده یا پیدا‌شده در سطح شهر تهران همراه با هشدار ۵ روزه و تحویل امن چی‌کجا.',
    seoIntro:
      'هر وسیله شخصی دیگری که در سطح شهر تهران گم شده یا پیدا شده است، در این بخش قابل ثبت و جست‌وجوست و پس از ۳ روز در صورت نیاز قابل ثبت مجدد است.',
    sensitive: false,
    safePointOnly: false,
    suggestedQuestions: [
      'رنگ یا جنس دقیق شیء چیست؟',
      'چه علامت، نوشته یا ویژگی خاصی روی آن دارد؟',
      'محتویات همراه یا برند آن چیست؟',
      'اندازه تقریبی یا بخش آسیب‌دیده آن کجاست؟',
    ],
  },
];

export const CATEGORY_MAP = new Map<ItemCategory, CategoryMeta>(
  CATEGORIES.map((c) => [c.id, c])
);

export const CATEGORY_BY_SLUG = new Map<string, CategoryMeta>(
  CATEGORIES.map((c) => [c.slug, c])
);

export const SAFE_POINT_ONLY_CATEGORIES = new Set<ItemCategory>([
  'id_documents',
  'bank_cards',
]);

export const DELIVERY_SECURITY_ADVISORY =
  'برای تحویل امن شیء، تا حد امکان از یابنده بخواهید آن را با پیک ارسال کند.\n\nدر صورت امکان‌پذیر نبودن ارسال با پیک، یک مکان عمومی و پرتردد در نزدیکی یک ارگان دولتی یا مجموعه معتبر را برای تحویل انتخاب کنید.\n\nهماهنگی‌ها را فقط از طریق گفت‌وگوی داخلی برنامه انجام دهید و اطلاعات شخصی خود را در اختیار افراد ناشناس قرار ندهید.';

export const OWNERSHIP_ATTEMPTS_WARNING =
  'با ۳ بار اشتباه پاسخ دادن، دسترسی شما به این آگهی برای همیشه بسته می‌شود.';
