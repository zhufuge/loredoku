import { buildDefaultSlug, gameDeploySchema, slugError } from '@loredoku/shared';
import type { MapDraft, MapGameDetail, MapGameSummary } from '@loredoku/shared';
import { ErrorCode } from '@loredoku/shared';
import * as mapRepo from '../repository/mapRepository';
import * as versionRepo from '../repository/versionRepository';
import * as gameRepo from '../repository/gameRepository';
import { AppError } from '../utils/AppError';
import { parseOrThrow } from '../utils/validate';
import { processGameCover } from '../utils/image';

/** Raised when `POST /api/games/:id/cover` arrives without a file part. */
export function coverRequired(): AppError {
  return new AppError(ErrorCode.VALIDATION_FAILED, '请选择要上传的封面图片');
}

export interface DeployGameInput {
  versionNo: number;
  name: string;
  /** OPT-W04: blank / missing → derived from the name + difficulty. */
  slug?: string;
  /** OPT-W03 §3: explicit "remove the stored cover". */
  clearCover?: boolean;
  coverPath?: string | null;
  coverMime?: string | null;
  coverSize?: number | null;
  coverWidth?: number | null;
  coverHeight?: number | null;
  difficulty?: MapGameSummary['difficulty'];
}

/**
 * FEAT-G02 (docs/v0.4.0.md §5): deploy a published work as a game.
 *
 * The snapshot is copied at deploy time, so a game keeps rendering the version
 * the player was given even after the map is re-published. Deploying another
 * version of the same map overwrites the previous game (see
 * `gameRepository.upsert`).
 *
 * OPT-W04: the deploy also (re)assigns the game's access path. A blank `slug`
 * is derived from the name + difficulty; an explicitly blank one is rejected
 * instead of silently derived, so the author never loses a typed value. A path
 * already owned by **another** map is a hard error — no silent `-2` suffix
 * (docs/v0.4.1.md §4.4, §14 Q12).
 */
export async function deployGame(projectId: number, input: DeployGameInput): Promise<MapGameSummary> {
  const body = parseOrThrow(gameDeploySchema, { ...input, versionNo: input.versionNo });

  const project = await mapRepo.getProjectRow(projectId);
  if (!project) {
    throw AppError.notFound('项目不存在');
  }

  const version = await versionRepo.getVersion(projectId, body.versionNo);
  if (!version) {
    throw AppError.notFound('作品不存在，无法部署');
  }

  // The name defaults to the map name; an explicitly blank string is rejected,
  // so an untouched field still deploys with the map's own name.
  const trimmed = (body.name ?? '').trim();
  if (body.name !== undefined && trimmed.length === 0) {
    throw AppError.validation('游戏名称必填');
  }
  const name = trimmed.length > 0 ? trimmed : project.name;
  const slug = await resolveSlug(projectId, body.slug, name, body.difficulty);

  return gameRepo.upsertGame({
    projectId,
    versionNo: body.versionNo,
    name,
    slug,
    coverPath: body.coverPath ?? null,
    coverMime: body.coverMime ?? null,
    coverSize: body.coverSize ?? null,
    coverWidth: body.coverWidth ?? null,
    coverHeight: body.coverHeight ?? null,
    clearCover: body.clearCover === true,
    difficulty: body.difficulty,
    gridSize: version.grid_size,
    snapshot: version.data as MapDraft,
  });
}

/**
 * OPT-W04 §4.3 / §4.4: derive when blank, otherwise validate what was typed,
 * then make sure no other map owns the path. Q13: a name that slugifies to
 * nothing does **not** get an invented path — the author has to type one.
 */
async function resolveSlug(
  projectId: number,
  rawSlug: string | undefined,
  name: string,
  difficulty: MapGameSummary['difficulty'],
): Promise<string> {
  const typed = (rawSlug ?? '').trim();
  if (rawSlug !== undefined && typed.length === 0) {
    throw AppError.validation('访问路径必填');
  }

  const slug = typed.length > 0 ? typed.toLowerCase() : buildDefaultSlug({ name, difficulty });

  const problem = slugError(slug);
  if (problem) {
    // An all-Chinese name derives nothing; say so instead of a bare format error.
    if (typed.length === 0) {
      throw AppError.validation('无法根据名称生成访问路径，请手动填写（仅限小写字母、数字与连字符）');
    }
    throw AppError.validation(problem);
  }

  const owner = await gameRepo.findGameBySlug(slug);
  if (owner && Number(owner.project_id) !== projectId) {
    throw AppError.validation(`访问路径「${slug}」已被占用，请更换`);
  }
  return slug;
}

export async function listGames(): Promise<MapGameSummary[]> {
  return gameRepo.listGames();
}

export async function getGame(id: number): Promise<MapGameDetail> {
  const row = await gameRepo.getGameRow(id);
  if (!row) {
    throw AppError.notFound('游戏不存在');
  }
  return gameRepo.toDetail(row);
}

/** OPT-W04 §4.6: the game page resolves its game by access path. */
export async function getGameBySlug(slug: string): Promise<MapGameDetail> {
  const row = await gameRepo.getGameRowBySlug(slug);
  if (!row) {
    throw AppError.notFound('游戏不存在');
  }
  return gameRepo.toDetail(row);
}

/** OPT-W02 §2: the works table flags the exact version that was deployed. */
export async function deployedVersionKeys(): Promise<Set<string>> {
  return gameRepo.listDeployedVersionKeys();
}

export async function uploadGameCover(id: number, buffer: Buffer): Promise<MapGameSummary> {
  const existing = await gameRepo.getGameRow(id);
  if (!existing) {
    throw AppError.notFound('游戏不存在');
  }
  const image = await processGameCover(Number(existing.id), buffer);
  const row = await gameRepo.updateGameCover(id, {
    path: image.relativePath,
    mime: image.mime,
    size: image.size,
    width: image.width,
    height: image.height,
  });
  if (!row) {
    throw AppError.notFound('游戏不存在');
  }
  return gameRepo.toSummary(row);
}
