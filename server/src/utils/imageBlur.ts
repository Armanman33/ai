import path from 'node:path';
import fs from 'node:fs';
import sharp from 'sharp';
import { PREVIEWS_DIR, UPLOADS_DIR } from '../config.js';
import { generateId } from './crypto.js';

export interface ProcessedImageResult {
  imagePath: string; // relative path inside storage/
  blurredImagePath: string; // relative path inside storage/
}

/**
 * Strips EXIF metadata, saves full sanitized image, and creates a real
 * server-side blurred/redacted preview image for pre-verification display.
 */
export async function processAndStoreItemImage(
  inputBuffer: Buffer,
  isSensitive: boolean
): Promise<ProcessedImageResult> {
  const fileId = generateId();
  const fullName = `${fileId}.jpg`;
  const blurName = `${fileId}_blur.jpg`;

  const fullAbs = path.join(UPLOADS_DIR, fullName);
  const blurAbs = path.join(PREVIEWS_DIR, blurName);

  // Rotate according to EXIF then strip ALL metadata (including GPS coordinates!)
  const baseImage = sharp(inputBuffer)
    .rotate()
    .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true });

  await baseImage.clone().jpeg({ quality: 84, mozjpeg: true }).toFile(fullAbs);

  await createBlurredPreview(fullAbs, blurAbs, isSensitive);

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

  const meta = await sharp(sourceAbs).metadata();
  const width = Math.min(meta.width || 640, 640);
  const height = Math.round(((meta.height || 480) / (meta.width || 640)) * width);

  // Pixelate + heavy Gaussian blur so details/text/faces/card numbers are unrecoverable
  const pixelFactor = isSensitive ? 18 : 10;
  const tinyW = Math.max(12, Math.round(width / pixelFactor));
  const tinyH = Math.max(12, Math.round(height / pixelFactor));

  let pipeline = sharp(sourceAbs)
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

  await pipeline.jpeg({ quality: 72 }).toFile(destAbs);
}
