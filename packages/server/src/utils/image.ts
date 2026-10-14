import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import {
  CHARACTER_AVATAR_MAX_DIMENSION,
  ErrorCode,
  THUMBNAIL_MAX_DIMENSION,
  UPLOAD_ALLOWED_MIME,
} from '@murdoku/shared';
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
  return processImage('cards', cardId, buffer, THUMBNAIL_MAX_DIMENSION);
}

export async function processAvatarImage(characterId: number, buffer: Buffer): Promise<ProcessedImage> {
  return processImage('characters', characterId, buffer, CHARACTER_AVATAR_MAX_DIMENSION);
}

async function processImage(
  folder: string,
  ownerId: number,
  buffer: Buffer,
  maxDimension: number,
): Promise<ProcessedImage> {
  const detected = detectImageType(buffer);
  if (!detected) {
    throw new AppError(ErrorCode.UNSUPPORTED_MEDIA_TYPE, '不支持的图片格式');
  }

  const dir = join(uploadRoot, folder, String(ownerId));
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
      .resize(maxDimension, maxDimension, {
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
    relativePath: `${folder}/${ownerId}/${originalName}`,
    mime: detected.mime,
    size: buffer.length,
    width,
    height,
  };
}
