import path from 'node:path';
import fs from 'node:fs';
import sharp from 'sharp';
import { PREVIEWS_DIR, UPLOADS_DIR } from '../config.js';
import { generateId } from './crypto.js';
import { AppError } from './errors.js';

export interface ProcessedImageResult {
  imagePath: string; // relative path inside storage/
  blurredImagePath: string; // relative path inside storage/
}

const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp']);
const MAX_INPUT_PIXELS = 25_000_000; // ~5000x5000 cap against decompression bombs
const MIN_DIMENSION = 48;
const MAX_DIMENSION = 8000;

/**
 * Validates actual image magic bytes & dimensions via Sharp (never trusting client MIME alone),
 * strips ALL EXIF/GPS metadata, saves sanitized JPEG, and generates a real server-side
 * blurred/redacted preview image for pre-verification display.
 */
export async function processAndStoreItemImage(
  inputBuffer: Buffer,
  isSensitive: boolean
): Promise<ProcessedImageResult> {
  if (!inputBuffer || inputBuffer.length < 32) {
    throw new AppError(400, 'فایل تصویر نامعتبر یا خالی است.', 'INVALID_IMAGE');
  }

  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(inputBuffer, {
      limitInputPixels: MAX_INPUT_PIXELS,
      failOn: 'error',
    }).metadata();
  } catch {
    throw new AppError(
      400,
      'فایل ارسال‌شده یک تصویر معتبر نیست یا آسیب دیده است. فقط JPG، PNG و WebP مجاز هستند.',
      'INVALID_IMAGE_FORMAT'
    );
  }

  if (!metadata.format || !ALLOWED_FORMATS.has(metadata.format)) {
    throw new AppError(
      400,
      'فرمت واقعی تصویر معتبر نیست. فقط فرمت‌های JPG، PNG و WebP مجاز هستند.',
      'UNSUPPORTED_IMAGE_FORMAT'
    );
  }

  const width = metadata.width || 0;
  const height = metadata.height || 0;
  if (width < MIN_DIMENSION || height < MIN_DIMENSION || width > MAX_DIMENSION || height > MAX_DIMENSION) {
    throw new AppError(
      400,
      'ابعاد تصویر مجاز نیست. لطفاً یک تصویر استاندارد بارگذاری کنید.',
      'INVALID_IMAGE_DIMENSIONS'
    );
  }

  const fileId = generateId();
  const fullName = `${fileId}.jpg`;
  const blurName = `${fileId}_blur.jpg`;

  const fullAbs = path.join(UPLOADS_DIR, fullName);
  const blurAbs = path.join(PREVIEWS_DIR, blurName);

  try {
    // Auto-orient via EXIF then re-encode without metadata (strips GPS, camera serials, EXIF comments)
    const baseImage = sharp(inputBuffer, {
      limitInputPixels: MAX_INPUT_PIXELS,
      failOn: 'error',
    })
      .rotate()
      .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true });

    await baseImage.clone().jpeg({ quality: 82, mozjpeg: true, progressive: true }).toFile(fullAbs);
    await createBlurredPreview(fullAbs, blurAbs, isSensitive);
  } catch (err) {
    // Clean up any partial files on failure
    if (fs.existsSync(fullAbs)) fs.unlinkSync(fullAbs);
    if (fs.existsSync(blurAbs)) fs.unlinkSync(blurAbs);
    if (err instanceof AppError) throw err;
    throw new AppError(400, 'پردازش تصویر با خطا مواجه شد. لطفاً تصویر دیگری انتخاب کنید.', 'IMAGE_PROCESSING_FAILED');
  }

  return {
    imagePath: `uploads/${fullName}`,
    blurredImagePath: `previews/${blurName}`,
  };
}

export async function createBlurredPreview(
  sourceAbs: string,
  destAbs: string,
  isSensitive: boolean
): Promise<void> {
  fs.mkdirSync(path.dirname(destAbs), { recursive: true });

  const meta = await sharp(sourceAbs, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  const width = Math.min(meta.width || 640, 640);
  const height = Math.max(48, Math.round(((meta.height || 480) / (meta.width || 640)) * width));

  // Pixelate + heavy Gaussian blur so details/text/faces/card numbers are unrecoverable
  const pixelFactor = isSensitive ? 18 : 10;
  const tinyW = Math.max(12, Math.round(width / pixelFactor));
  const tinyH = Math.max(12, Math.round(height / pixelFactor));

  let pipeline = sharp(sourceAbs, { limitInputPixels: MAX_INPUT_PIXELS })
    .resize(tinyW, tinyH, { fit: 'fill' })
    .resize(width, height, { fit: 'fill', kernel: sharp.kernel.cubic })
    .blur(isSensitive ? 18 : 10);

  if (isSensitive) {
    // Add semi-opaque redaction veil for sensitive documents / bank cards
    const overlaySvg = Buffer.from(`
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="rgba(10,10,10,0.42)" />
        <rect x="${Math.round(width * 0.08)}" y="${Math.round(height * 0.36)}" width="${Math.round(width * 0.84)}" height="${Math.round(height * 0.28)}" rx="14" fill="rgba(10,10,10,0.78)" stroke="#FACC15" stroke-width="2" />
        <circle cx="${Math.round(width * 0.5)}" cy="${Math.round(height * 0.5)}" r="22" fill="none" stroke="#FACC15" stroke-width="3" />
        <line x1="${Math.round(width * 0.5) - 10}" y1="${Math.round(height * 0.5) - 10}" x2="${Math.round(width * 0.5) + 10}" y2="${Math.round(height * 0.5) + 10}" stroke="#FACC15" stroke-width="3" />
      </svg>
    `);
    pipeline = pipeline.composite([{ input: overlaySvg, top: 0, left: 0 }]);
  }

  await pipeline.jpeg({ quality: 72, progressive: true }).toFile(destAbs);
}
