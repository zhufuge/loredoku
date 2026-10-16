import { buildDefaultSlug, gameDeploySchema, slugError } from '@loredoku/shared';
import type { MapDraft, MapGameDetail, MapGameSnapshot, MapGameSummary } from '@loredoku/shared';
import { ErrorCode } from '@loredoku/shared';
import * as versionRepo from '../repository/versionRepository';
import * as puzzleRepo from '../repository/puzzleRepository';
import * as gameRepo from '../repository/gameRepository';
import { AppError } from '../utils/AppError';
import { parseOrThrow } from '../utils/validate';
import { processGameCover } from '../utils/image';
import { absorbLegacyMapDraft } from './mapDraftCompat';

/** Raised when `POST /api/games/:id/cover` arrives without a file part. */
export function coverRequired(): AppError {
  return new AppError(ErrorCode.VALIDATION_FAILED, '请选择要上传的封面图片');
}

export interface DeployGameInput {
  name?: string;
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
 * CONS-K16 (docs/v0.5.0.md §10.1): deploy a **puzzle** as a game.
 *
 * v0.5.0 moved the unit of deployment from "one published version" to "one
 * puzzle": the puzzle owns the participants, the version only owns the canvas.
 * The snapshot therefore records both — `{ map, puzzle }` — and stays frozen, so
 * a later publish never changes a game that is already playable. Deploying
 * again overwrites the same puzzle's game (see `gameRepository.upsertGame`).
 *
 * No `versionNo` travels in the body: the puzzle pins the version it draws on.
 */
export async function deployGame(puzzleId: number, input: DeployGameInput): Promise<MapGameSummary> {
  const body = parseOrThrow(gameDeploySchema, input);

  const puzzle = await puzzleRepo.getPuzzleRow(puzzleId);
  if (!puzzle) {
    throw AppError.notFound('谜题不存在');
  }

  const projectId = Number(puzzle.map_project_id);
  const version = await versionRepo.getVersion(projectId, puzzle.map_version_no);
  if (!version) {
    throw AppError.notFound('谜题引用的地图版本不存在，无法部署');
  }

  // The name defaults to the puzzle name; an explicitly blank string is
  // rejected, so an untouched field still deploys with the puzzle's own name.
  const trimmed = (body.name ?? '').trim();
  if (body.name !== undefined && trimmed.length === 0) {
    throw AppError.validation('游戏名称必填');
  }
  const name = trimmed.length > 0 ? trimmed : puzzle.name;
  const slug = await resolveSlug(puzzleId, body.slug, name, body.difficulty);

  const snapshot: MapGameSnapshot = {
    map: absorbLegacyMapDraft(version.data) as MapDraft,
    puzzle: puzzleRepo.isPuzzleDraft(puzzle.data) ? puzzle.data : null,
  };

  return gameRepo.upsertGame({
    puzzleId,
    projectId,
    versionNo: puzzle.map_version_no,
    name,
    slug,
    coverPath: body.coverPath ?? null,
    coverMime: body.coverMime ?? null,
    coverSize: body.coverSize ?? null,
    coverWidth: body.coverWidth ?? null,
    coverHeight: body.coverHeight ?? null,
    clearCover: body.clearCover === true,
    difficulty: body.difficulty,
    gridSize: puzzle.grid_size,
    snapshot,
  });
}

/**
 * OPT-W04 §4.3 / §4.4: derive when blank, otherwise validate what was typed,
 * then make sure no other puzzle owns the path. Q13: a name that slugifies to
 * nothing does **not** get an invented path — the author has to type one.
 */
async function resolveSlug(
  puzzleId: number,
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
  if (owner && Number(owner.puzzle_id) !== puzzleId) {
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
