import path from 'node:path';
import fs from 'node:fs';
import sharp from 'sharp';
import { CATEGORY_MAP, CONFIG, DEMO_MEDIA_DIR, ItemCategory, PREVIEWS_DIR } from '../config.js';
import { addDaysIso, getDb } from '../db/database.js';
import { encryptText, generateId } from '../utils/crypto.js';
import { createBlurredPreview } from '../utils/imageBlur.js';
import { normalizePersianText } from '../utils/persian.js';

interface DemoItemDef {
  id: string;
  finderId: string;
  title: string;
  category: ItemCategory;
  description: string;
  areaName: string;
  lat: number;
  lng: number;
  hoursAgoFound: number;
  deliveryMethod: 'courier' | 'safe_point';
  safePointId: string | null;
  imageSvg: string;
  questions: [
    { q: string; a: string },
    { q: string; a: string },
    { q: string; a: string },
  ];
}

const DEMO_USERS = [
  { id: 'demo-finder-1', phone: '09120001101', displayName: 'مهدی (یابنده نمونه)' },
  { id: 'demo-finder-2', phone: '09120001102', displayName: 'نگار (یابنده نمونه)' },
  { id: 'demo-finder-3', phone: '09120001103', displayName: 'آرش (یابنده نمونه)' },
];

const DEMO_ITEMS: DemoItemDef[] = [
  {
    id: 'demo-item-vanak-bag',
    finderId: 'demo-finder-1',
    title: 'کیف دوشی چرم قهوه‌ای در محدوده میدان ونک',
    category: 'bag',
    description: 'نزدیک ایستگاه بی‌آرتی میدان ونک پیدا شده و نزد یابنده در امانت است.',
    areaName: 'میدان ونک',
    lat: 35.7579,
    lng: 51.4094,
    hoursAgoFound: 5,
    deliveryMethod: 'courier',
    safePointId: null,
    imageSvg: `<svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#E7E2D8"/><stop offset="100%" stop-color="#CFC6B6"/></linearGradient></defs>
      <rect width="800" height="600" fill="url(#bg)"/>
      <ellipse cx="400" cy="495" rx="220" ry="32" fill="rgba(0,0,0,0.18)"/>
      <path d="M280 220 C280 110, 520 110, 520 220" fill="none" stroke="#4A2E1B" stroke-width="22" stroke-linecap="round"/>
      <rect x="210" y="210" width="380" height="260" rx="34" fill="#6B3E26" stroke="#3E2212" stroke-width="8"/>
      <path d="M210 270 Q400 340 590 270 L590 210 Q400 210 210 210 Z" fill="#5A331E"/>
      <rect x="372" y="285" width="56" height="44" rx="10" fill="#D4AF37" stroke="#8F6E17" stroke-width="4"/>
      <circle cx="400" cy="307" r="7" fill="#5A331E"/>
    </svg>`,
    questions: [
      { q: 'رنگ داخلی کیف چیست؟', a: 'قرمز' },
      { q: 'چه وسیله خاصی داخل آن وجود دارد؟', a: 'عینک آفتابی' },
      { q: 'یکی از ویژگی‌های ظاهری خاص آن چیست؟', a: 'زیپ مخفی پشتی' },
    ],
  },
  {
    id: 'demo-item-tajrish-phone',
    finderId: 'demo-finder-2',
    title: 'گوشی هوشمند پیدا شده حوالی مترو تجریش',
    category: 'electronics',
    description: 'روی صندلی ایستگاه مترو تجریش پیدا شد و به باجه امن تحویل داده می‌شود.',
    areaName: 'میدان تجریش',
    lat: 35.8049,
    lng: 51.4292,
    hoursAgoFound: 8,
    deliveryMethod: 'safe_point',
    safePointId: 'sp-tajrish',
    imageSvg: `<svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="bg2" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#DFE5E8"/><stop offset="100%" stop-color="#BFCBD0"/></linearGradient></defs>
      <rect width="800" height="600" fill="url(#bg2)"/>
      <ellipse cx="400" cy="510" rx="140" ry="22" fill="rgba(0,0,0,0.16)"/>
      <rect x="295" y="95" width="210" height="400" rx="34" fill="#1B4D3E" stroke="#0F2D24" stroke-width="10"/>
      <rect x="312" y="114" width="176" height="362" rx="22" fill="#14181F"/>
      <rect x="366" y="128" width="68" height="14" rx="7" fill="#2A303C"/>
      <path d="M312 370 L395 270 L450 325 L488 285 L488 476 L312 476 Z" fill="#3B5B7C" opacity="0.65"/>
      <circle cx="438" cy="215" r="24" fill="#FACC15" opacity="0.75"/>
    </svg>`,
    questions: [
      { q: 'رنگ قاب گوشی چیست؟', a: 'سبز یشمی' },
      { q: 'تصویر پس‌زمینه گوشی چه چیزی است؟', a: 'کوه دماوند' },
      { q: 'برند یا مدل دقیق گوشی چیست؟', a: 'آیفون ۱۳' },
    ],
  },
  {
    id: 'demo-item-valiasr-keys',
    finderId: 'demo-finder-3',
    title: 'دسته کلید با ریموت در محدوده میدان ولیعصر',
    category: 'keys',
    description: 'در پیاده‌روی ضلع غربی میدان ولیعصر پیدا شده است.',
    areaName: 'میدان ولیعصر',
    lat: 35.7121,
    lng: 51.4063,
    hoursAgoFound: 14,
    deliveryMethod: 'courier',
    safePointId: null,
    imageSvg: `<svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
      <rect width="800" height="600" fill="#ECEAE4"/>
      <circle cx="340" cy="220" r="56" fill="none" stroke="#9AA3AE" stroke-width="14"/>
      <rect x="368" y="246" width="170" height="28" rx="8" transform="rotate(28 368 246)" fill="#B5BDC7" stroke="#6E7782" stroke-width="4"/>
      <rect x="320" y="268" width="155" height="24" rx="8" transform="rotate(62 320 268)" fill="#C9B06B" stroke="#856E31" stroke-width="4"/>
      <rect x="205" y="260" width="94" height="145" rx="22" transform="rotate(-18 205 260)" fill="#1D4ED8" stroke="#1E3A8A" stroke-width="6"/>
      <circle cx="258" cy="316" r="14" fill="#93C5FD"/>
      <circle cx="268" cy="356" r="10" fill="#DBEAFE"/>
    </svg>`,
    questions: [
      { q: 'چند کلید به دسته متصل است؟', a: '۴' },
      { q: 'جاکلیدی چه رنگی است؟', a: 'آبی' },
      { q: 'چه علامت خاصی روی آن وجود دارد؟', a: 'ریموت پارکینگ' },
    ],
  },
  {
    id: 'demo-item-enghelab-id',
    finderId: 'demo-finder-1',
    title: 'مدرک شناسایی در کاور شفاف حوالی میدان انقلاب',
    category: 'id_documents',
    description: 'تحویل منحصراً از طریق نقطه امن ایستگاه مترو میدان انقلاب انجام می‌شود.',
    areaName: 'میدان انقلاب',
    lat: 35.7014,
    lng: 51.3918,
    hoursAgoFound: 11,
    deliveryMethod: 'safe_point',
    safePointId: 'sp-enghelab',
    imageSvg: `<svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
      <rect width="800" height="600" fill="#E5E7EB"/>
      <rect x="175" y="145" width="450" height="300" rx="24" fill="#F8FAFC" stroke="#475569" stroke-width="6"/>
      <rect x="175" y="145" width="450" height="58" rx="18" fill="#1E293B"/>
      <rect x="485" y="232" width="104" height="128" rx="12" fill="#CBD5E1"/>
      <rect x="220" y="245" width="230" height="20" rx="6" fill="#94A3B8"/>
      <rect x="260" y="285" width="190" height="16" rx="6" fill="#CBD5E1"/>
      <rect x="290" y="322" width="160" height="16" rx="6" fill="#CBD5E1"/>
    </svg>`,
    questions: [
      { q: 'نام و نام خانوادگی ثبت‌شده روی مدرک چیست؟', a: 'سارا رضایی' },
      { q: 'سال تولد یا محل صدور درج‌شده چیست؟', a: '۱۳۷۵' },
      { q: 'مدرک داخل چه نوع جلد یا کاوری قرار داشت؟', a: 'جلد شفاف' },
    ],
  },
  {
    id: 'demo-item-saadat-card',
    finderId: 'demo-finder-2',
    title: 'کارت بانکی پیدا شده در میدان کاج سعادت‌آباد',
    category: 'bank_cards',
    description: 'نزدیک خودپرداز میدان کاج پیدا شد و برای حفظ امنیت فقط در نقطه امن تحویل می‌شود.',
    areaName: 'سعادت‌آباد (میدان کاج)',
    lat: 35.7815,
    lng: 51.3751,
    hoursAgoFound: 6,
    deliveryMethod: 'safe_point',
    safePointId: 'sp-saadat-abad',
    imageSvg: `<svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
      <rect width="800" height="600" fill="#E2E8F0"/>
      <rect x="165" y="155" width="470" height="290" rx="26" fill="#0F4C81" stroke="#082F49" stroke-width="6"/>
      <rect x="215" y="235" width="70" height="52" rx="10" fill="#FACC15"/>
      <rect x="215" y="320" width="350" height="22" rx="8" fill="rgba(255,255,255,0.45)"/>
      <rect x="215" y="366" width="210" height="18" rx="6" fill="rgba(255,255,255,0.35)"/>
    </svg>`,
    questions: [
      { q: 'نام بانک صادرکننده کارت چیست؟', a: 'سامان' },
      { q: 'نام دارنده کارت چیست؟', a: 'امیرحسین مرادی' },
      { q: 'چهار رقم آخر شماره کارت چیست؟', a: '۴۸۲۱' },
    ],
  },
  {
    id: 'demo-item-mellat-watch',
    finderId: 'demo-finder-3',
    title: 'ساعت مچی بند استیل در پارک ملت',
    category: 'jewelry_watch',
    description: 'اطراف پیاده‌رو شمالی پارک ملت پیدا شده است.',
    areaName: 'پارک ملت',
    lat: 35.7782,
    lng: 51.4109,
    hoursAgoFound: 18,
    deliveryMethod: 'courier',
    safePointId: null,
    imageSvg: `<svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
      <rect width="800" height="600" fill="#ECEEF2"/>
      <rect x="352" y="70" width="96" height="460" rx="24" fill="#9CA3AF" stroke="#4B5563" stroke-width="6"/>
      <circle cx="400" cy="300" r="112" fill="#D1D5DB" stroke="#374151" stroke-width="10"/>
      <circle cx="400" cy="300" r="92" fill="#172554"/>
      <line x1="400" y1="300" x2="400" y2="235" stroke="#F8FAFC" stroke-width="7" stroke-linecap="round"/>
      <line x1="400" y1="300" x2="452" y2="300" stroke="#FACC15" stroke-width="5" stroke-linecap="round"/>
      <circle cx="400" cy="300" r="8" fill="#FACC15"/>
    </svg>`,
    questions: [
      { q: 'برند یا نوشته روی صفحه ساعت چیست؟', a: 'کاسیو' },
      { q: 'رنگ صفحه یا جنس بند آن چیست؟', a: 'سرمه‌ای' },
      { q: 'چه علامت، حکاکی یا آسیب جزئی روی آن وجود دارد؟', a: 'خط ریز روی شیشه' },
    ],
  },
];

/**
 * Seeds isolated demo data (is_demo = 1) into storage/demo/ without ever colliding with real user data.
 */
export async function ensureDemoDataSeeded(): Promise<void> {
  if (!CONFIG.SEED_DEMO_DATA) return;

  const db = getDb();
  const now = new Date();
  const nowStr = now.toISOString();

  // Seed demo finder accounts (clearly tagged is_demo = 1)
  const userStmt = db.prepare(`
    INSERT OR IGNORE INTO users (id, phone, display_name, notifications_enabled, is_demo, is_suspended, created_at, updated_at)
    VALUES (?, ?, ?, 1, 1, 0, ?, ?)
  `);
  for (const u of DEMO_USERS) {
    userStmt.run(u.id, u.phone, u.displayName, nowStr, nowStr);
  }

  // Only seed demo items if none currently exist (idempotent)
  const existingDemoItems = (
    db.prepare(`SELECT COUNT(*) AS cnt FROM found_items WHERE is_demo = 1`).get() as { cnt: number }
  ).cnt;

  if (existingDemoItems > 0) return;

  for (const item of DEMO_ITEMS) {
    const fullFilename = `${item.id}.jpg`;
    const blurFilename = `${item.id}_blur.jpg`;
    const fullAbs = path.join(DEMO_MEDIA_DIR, fullFilename);
    const blurAbs = path.join(PREVIEWS_DIR, blurFilename);

    fs.mkdirSync(DEMO_MEDIA_DIR, { recursive: true });
    if (!fs.existsSync(fullAbs)) {
      await sharp(Buffer.from(item.imageSvg)).jpeg({ quality: 88 }).toFile(fullAbs);
    }
    const isSensitive = Boolean(CATEGORY_MAP.get(item.category)?.sensitive);
    if (!fs.existsSync(blurAbs)) {
      await createBlurredPreview(fullAbs, blurAbs, isSensitive);
    }

    const foundAt = new Date(now.getTime() - item.hoursAgoFound * 60 * 60 * 1000).toISOString();
    const expiresAt = addDaysIso(now, CONFIG.FOUND_ITEM_TTL_DAYS);

    db.prepare(`
      INSERT OR IGNORE INTO found_items (
        id, finder_id, title, category, description, area_name, lat, lng, found_at,
        image_path, blurred_image_path, delivery_method, safe_point_id,
        status, expires_at, near_expiry_notified, relist_count, is_demo, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, 0, 0, 1, ?, ?)
    `).run(
      item.id,
      item.finderId,
      item.title,
      item.category,
      item.description,
      item.areaName,
      item.lat,
      item.lng,
      foundAt,
      `demo/${fullFilename}`,
      `previews/${blurFilename}`,
      item.deliveryMethod,
      item.safePointId,
      expiresAt,
      nowStr,
      nowStr
    );

    const qStmt = db.prepare(`
      INSERT OR IGNORE INTO item_questions (id, item_id, question_index, question_text, answer_encrypted, answer_normalized)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    item.questions.forEach((q, idx) => {
      qStmt.run(
        generateId(),
        item.id,
        idx + 1,
        q.q,
        encryptText(q.a),
        normalizePersianText(q.a)
      );
    });
  }
}
