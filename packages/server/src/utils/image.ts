import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { ErrorCode, THUMBNAIL_MAX_DIMENSION, UPLOAD_ALLOWED_MIME } from '@murdoku/shared';
import { AppError } from './AppError';
import { uploadRoot } from './paths';

type AllowedMime = (typeof UPLOAD_ALLOWED_MIME)[number];

interface DetectedImage {
  mime: AllowedMime;
  ext: string;
}

export interface ProcessedImage {
  relativePath: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
}

export function detectImageType(buffer: Buffer): DetectedImage | null {
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { mime: 'image/png', ext: 'png' };
  }

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }

  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { mime: 'image/webp', ext: 'webp' };
  }

  const head = buffer.toString('utf8', 0, 1024).trimStart().toLowerCase();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) {
    return { mime: 'image/svg+xml', ext: 'svg' };
  }

  return null;
}

export async function processCardImage(cardId: number, buffer: Buffer): Promise<ProcessedImage> {
  const detected = detectImageType(buffer);
  if (!detected) {
    throw new AppError(ErrorCode.UNSUPPORTED_MEDIA_TYPE, '不支持的图片类型');
  }

  const dir = join(uploadRoot, 'cards', String(cardId));
  await mkdir(dir, { recursive: true });

  const uuid = randomUUID();
  const originalName = `${uuid}.${detected.ext}`;
  await writeFile(join(dir, originalName), buffer);

  let width: number | null = null;
  let height: number | null = null;

  try {
    const metadata = await sharp(buffer, { density: 96 }).metadata();
    width = metadata.width ?? null;
    height = metadata.height ?? null;
    await sharp(buffer, { density: 96 })
      .resize(THUMBNAIL_MAX_DIMENSION, THUMBNAIL_MAX_DIMENSION, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toFile(join(dir, `${uuid}_thumb.webp`));
  } catch {
    width = null;
    height = null;
  }

  return {
    relativePath: `cards/${cardId}/${originalName}`,
    mime: detected.mime,
    size: buffer.length,
    width,
    height,
  };
}
