const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

export function toAsciiDigits(input: string): string {
  let out = '';
  for (const ch of input) {
    const pIdx = PERSIAN_DIGITS.indexOf(ch);
    if (pIdx !== -1) {
      out += String(pIdx);
      continue;
    }
    const aIdx = ARABIC_DIGITS.indexOf(ch);
    if (aIdx !== -1) {
      out += String(aIdx);
      continue;
    }
    out += ch;
  }
  return out;
}

export function normalizeIranPhone(raw: string): string | null {
  const cleaned = toAsciiDigits(raw).replace(/[\s\-()]/g, '');
  let normalized = cleaned;
  if (normalized.startsWith('+98')) {
    normalized = '0' + normalized.slice(3);
  } else if (normalized.startsWith('0098')) {
    normalized = '0' + normalized.slice(4);
  } else if (normalized.startsWith('98') && normalized.length === 12) {
    normalized = '0' + normalized.slice(2);
  } else if (normalized.startsWith('9') && normalized.length === 10) {
    normalized = '0' + normalized;
  }
  if (!/^09\d{9}$/.test(normalized)) {
    return null;
  }
  return normalized;
}

const SYNONYM_MAP: Record<string, string> = {
  سیاه: 'مشکی',
  تیره: 'مشکی',
  سپید: 'سفید',
  سرخ: 'قرمز',
  زرشکی: 'قرمز',
  سورمه: 'سرمهای',
  سرمه‌ای: 'سرمهای',
  سورمه‌ای: 'سرمهای',
  قهوه‌ای: 'قهوهای',
  طلایی: 'طلایی',
  نقره‌ای: 'نقرهای',
  خاکستری: 'طوسی',
  سبز: 'سبز',
  آیفون: 'iphone',
  سامسونگ: 'samsung',
  شیائومی: 'xiaomi',
  شیایومی: 'xiaomi',
  اپل: 'apple',
  هواوی: 'huawei',
  یک: '1',
  یکی: '1',
  دو: '2',
  دوتا: '2',
  سه: '3',
  سه‌تا: '3',
  چهار: '4',
  چهارتا: '4',
  پنج: '5',
  پنجتا: '5',
  شش: '6',
  شیش: '6',
  هفت: '7',
  هشت: '8',
  نه: '9',
  ده: '10',
};

const STOP_WORDS = new Set([
  'رنگ',
  'رنگش',
  'مدل',
  'مدلش',
  'عدد',
  'تا',
  'یک',
  'یه',
  'است',
  'هست',
  'دارد',
  'داره',
  'با',
  'از',
  'در',
  'به',
  'روی',
  'داخل',
  'تو',
  'توی',
  'عکس',
  'تصویر',
  'بانک',
  'برند',
  'کیف',
  'گوشی',
  'کلید',
]);

export function normalizePersianText(input: string): string {
  return toAsciiDigits(input)
    .toLowerCase()
    .replace(/ي/g, 'ی')
    .replace(/ى/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/ة/g, 'ه')
    .replace(/ۀ/g, 'ه')
    .replace(/أ|إ|آ/g, 'ا')
    .replace(/[\u064B-\u065F\u0670]/g, '') // Arabic diacritics
    .replace(/\u200c/g, ' ') // ZWNJ to space
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeSemantic(normalized: string): string[] {
  const rawTokens = normalized.split(' ').filter(Boolean);
  const mapped = rawTokens.map((t) => SYNONYM_MAP[t] || t);
  const meaningful = mapped.filter((t) => !STOP_WORDS.has(t));
  return meaningful.length > 0 ? meaningful : mapped;
}

/**
 * Evaluates whether a claimant's answer matches the finder's hidden secret answer.
 * Strict enough to reject wrong guesses, fair enough to accept standard Persian spelling variants.
 */
export function doesAnswerMatch(submittedRaw: string, expectedNormalized: string): boolean {
  const submitted = normalizePersianText(submittedRaw);
  const expected = normalizePersianText(expectedNormalized);

  if (!submitted || !expected) return false;
  if (submitted === expected) return true;

  // Compact whitespace comparison (handles "سرمه ای" vs "سرمه‌ای")
  if (submitted.replace(/\s+/g, '') === expected.replace(/\s+/g, '')) return true;

  const subTokens = tokenizeSemantic(submitted);
  const expTokens = tokenizeSemantic(expected);

  if (subTokens.length === 0 || expTokens.length === 0) return false;

  // Exact token set equality after synonym normalization
  const subSet = new Set(subTokens);
  const expSet = new Set(expTokens);

  let overlap = 0;
  for (const t of expSet) {
    if (subSet.has(t)) {
      overlap++;
    } else if (t.length >= 3) {
      // Allow prefix/substring match for Persian morphological variants (e.g. "خودکار" vs "خودکاری")
      for (const st of subSet) {
        if (st.length >= 3 && (st.includes(t) || t.includes(st))) {
          overlap++;
          break;
        }
      }
    }
  }

  // If expected answer is a single token (e.g., color, number, last 4 digits, brand),
  // require that exact token to be present and submitted answer not be a giant guess dump
  if (expSet.size === 1) {
    return overlap === 1 && subSet.size <= 3;
  }

  // For multi-token answers, require >= 65% of expected tokens matched and reasonable precision
  const recall = overlap / expSet.size;
  const precision = overlap / subSet.size;
  return recall >= 0.65 && precision >= 0.45;
}

/**
 * Checks if chat text attempts to share an Iranian mobile or landline phone number
 */
export function containsPhoneNumber(text: string): boolean {
  const ascii = toAsciiDigits(text).replace(/[\s\-_.()]/g, '');
  if (/(\+?98|0098|0)?9\d{9}/.test(ascii)) return true;
  if (/021\d{7,8}/.test(ascii)) return true;
  return false;
}

export function maskPhoneForSelf(phone: string): string {
  if (phone.length < 11) return phone;
  return `${phone.slice(0, 4)}***${phone.slice(7)}`;
}
