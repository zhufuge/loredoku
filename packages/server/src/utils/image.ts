import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp, { type Metadata } from 'sharp';
import {
  CHARACTER_AVATAR_MAX_DIMENSION,
  ErrorCode,
  FORBIDDEN_SYMBOL_MAX_DIMENSION,
  GAME_COVER_MAX_DIMENSION,
  MAP_COVER_MAX_DIMENSION,
  PUZZLE_COVER_MAX_DIMENSION,
  THUMBNAIL_MAX_DIMENSION,
  UPLOAD_ALLOWED_MIME,
  type GameToolIconKind,
} from '@loredoku/shared';
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

/**
 * v0.6.1: the variant owns the appearance, so the file lands one level deeper —
 * `assets/<assetId>/variants/<variantId>/` — and the directory stays owned by the
 * asset (a hard delete of the asset still takes the whole subtree with it).
 */
export async function processAssetVariantImage(
  assetId: number,
  variantId: number,
  buffer: Buffer,
): Promise<ProcessedImage> {
  return processImage(`assets/${assetId}/variants`, variantId, buffer, THUMBNAIL_MAX_DIMENSION);
}

export async function processAvatarImage(characterId: number, buffer: Buffer): Promise<ProcessedImage> {
  return processImage('characters', characterId, buffer, CHARACTER_AVATAR_MAX_DIMENSION);
}

/** FEAT-G02: a deployed game's cover art, stored under `games/<gameId>/`. */
export async function processGameCover(gameId: number, buffer: Buffer): Promise<ProcessedImage> {
  return processImage('games', gameId, buffer, GAME_COVER_MAX_DIMENSION);
}

/** FEAT-H03 (docs/v0.4.2.md §3.2c): a map's cover art, under `maps/<id>/`. */
export async function processMapCover(
  mapId: number,
  buffer: Buffer,
): Promise<ProcessedImage> {
  return processImage('maps', mapId, buffer, MAP_COVER_MAX_DIMENSION);
}

/** v0.7.1 §7.5: a puzzle's cover art, under `puzzles/<id>/`. */
export async function processPuzzleCover(
  puzzleId: number,
  buffer: Buffer,
): Promise<ProcessedImage> {
  return processImage('puzzles', puzzleId, buffer, PUZZLE_COVER_MAX_DIMENSION);
}

/**
 * v0.8.6（docs/v0.8.6.md §4）：禁止符号的上传图 —— 谜题自己那一张，或主题的
 * 「新建谜题缺省」。
 *
 * 路径按**谁拥有它**分目录（`puzzles/<id>/forbidden-symbol/` /
 * `themes/<id>/forbidden-symbol/`）：这样看得出这张图是从哪来的。注意删行**不会**
 * 删文件（与封面同策略，见 docs/v0.8.6.md §6）：复制谜题、fork 出来的草稿会共用
 * 同一个 `path`，删了就把别人还在引用的图弄丢了。
 */
export async function processForbiddenSymbolImage(
  owner: { kind: 'puzzle' | 'theme'; id: number },
  buffer: Buffer,
): Promise<ProcessedImage> {
  return processSymbolImage(owner, 'forbidden-symbol', buffer);
}

/**
 * v0.8.7 §7：工具按钮的图标（清除 / 撤回 / 提交）。
 *
 * 与禁止符号同一档尺寸（按钮上画 20px，256 已经富余）：所以复用那条「只写一张
 * webp」的通道，只是目录再深一层 `.../tool-icons/<icon>/`。作者换一张图，旧文件
 * 留在原地不删 —— 版本行、复制出来的谜题可能还指着它。
 */
export async function processToolIconImage(
  owner: { kind: 'puzzle' | 'theme'; id: number },
  icon: GameToolIconKind,
  buffer: Buffer,
): Promise<ProcessedImage> {
  return processSymbolImage(owner, `tool-icons/${icon}`, buffer);
}

/** 两种「符号级小图」共用的一条路：按所有者分目录，长边缩到 256。 */
async function processSymbolImage(
  owner: { kind: 'puzzle' | 'theme'; id: number },
  sub: string,
  buffer: Buffer,
): Promise<ProcessedImage> {
  const folder = `${owner.kind === 'puzzle' ? 'puzzles' : 'themes'}/${owner.id}/${sub}`;
  return processScaledImage(folder, buffer, FORBIDDEN_SYMBOL_MAX_DIMENSION);
}

/**
 * 只写一张缩放后的 webp 的通道（v0.8.6 §4 的禁止符号用）。
 *
 * 与 {@link processImage} 的「原图 + 缩略图」不同：那张图最终画在棋盘上只有几十
 * 像素，留一份原图只是让同一张图在磁盘上多存一遍。所以这里处理失败就直接报
 * 415 —— 返回一个指向不存在文件的 `path`，比当场说「这张图用不了」难查得多。
 */
async function processScaledImage(
  folder: string,
  buffer: Buffer,
  maxDimension: number,
): Promise<ProcessedImage> {
  if (!detectImageType(buffer)) {
    throw new AppError(ErrorCode.UNSUPPORTED_MEDIA_TYPE, '不支持的图片格式');
  }

  const relativePath = `${folder}/${randomUUID()}.webp`;

  let metadata: Metadata;
  let data: Buffer;
  try {
    // 原图尺寸只作记录；真正决定落盘的是长边 ≤ `maxDimension` 的那次 resize。
    metadata = await sharp(buffer, { density: 96 }).metadata();
    data = await sharp(buffer, { density: 96 })
      .resize(maxDimension, maxDimension, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      // 保留透明通道（webp 默认带 alpha），quality 85 是「小图看得清」与
      // 「这张图本来就不该大」之间的折中。
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    throw new AppError(ErrorCode.UNSUPPORTED_MEDIA_TYPE, '不支持的图片格式');
  }

  // 转码成功才建目录 / 落盘：失败不该在 uploads 下留一个空目录。
  const dir = join(uploadRoot, folder);
  await mkdir(dir, { recursive: true });
  await writeFile(join(uploadRoot, relativePath), data);

  return {
    relativePath,
    mime: 'image/webp',
    size: data.length,
    width: metadata.width ?? null,
    height: metadata.height ?? null,
  };
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
