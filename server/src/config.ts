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

function loadOrCreateSecret(): string {
  if (process.env.APP_SECRET && process.env.APP_SECRET.length >= 32) {
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

export const CONFIG = {
  PORT: Number(process.env.PORT || 3000),
  HOST: process.env.HOST || '0.0.0.0',
  NODE_ENV: process.env.NODE_ENV || 'development',
  APP_SECRET: loadOrCreateSecret(),
  SMS_PROVIDER: process.env.SMS_PROVIDER || 'sandbox', // 'sandbox' | 'kavenegar'
  KAVENEGAR_API_KEY: process.env.KAVENEGAR_API_KEY || '',
  SEED_DEMO_DATA: process.env.SEED_DEMO_DATA !== 'false',

  // Lifecycle rules (strictly per specification)
  FOUND_ITEM_TTL_DAYS: 3,
  LOST_ALERT_TTL_DAYS: 5,
  NEAR_EXPIRY_HOURS: 12,
  MAX_WRONG_OWNERSHIP_ATTEMPTS: 3,
  OTP_EXPIRY_MINUTES: 3,
  SESSION_TTL_DAYS: 30,

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
  label: string;
  sensitive: boolean;
  safePointOnly: boolean;
  suggestedQuestions: string[];
}

export const CATEGORIES: CategoryMeta[] = [
  {
    id: 'electronics',
    label: 'موبایل و لوازم الکترونیکی',
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
    label: 'کیف و کوله',
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
    label: 'کلید',
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
    label: 'مدارک شناسایی',
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
    label: 'کارت بانکی',
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
    label: 'ساعت و زیورآلات',
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
    label: 'پوشاک',
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
    label: 'سایر موارد',
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

export const SAFE_POINT_ONLY_CATEGORIES = new Set<ItemCategory>([
  'id_documents',
  'bank_cards',
]);

export const DELIVERY_SECURITY_ADVISORY =
  'برای تحویل امن شیء، تا حد امکان از یابنده بخواهید آن را با پیک ارسال کند.\n\nدر صورت امکان‌پذیر نبودن ارسال با پیک، یک مکان عمومی و پرتردد در نزدیکی یک ارگان دولتی یا مجموعه معتبر را برای تحویل انتخاب کنید.\n\nهماهنگی‌ها را فقط از طریق گفت‌وگوی داخلی برنامه انجام دهید و اطلاعات شخصی خود را در اختیار افراد ناشناس قرار ندهید.';

export const OWNERSHIP_ATTEMPTS_WARNING =
  'با ۳ بار اشتباه پاسخ دادن، دسترسی شما به این آگهی برای همیشه بسته می‌شود.';
