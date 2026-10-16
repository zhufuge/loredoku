import { gameDeploySchema } from '@murdoku/shared';
import type { MapDraft, MapGameDetail, MapGameSummary } from '@murdoku/shared';
import { ErrorCode } from '@murdoku/shared';
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

  return gameRepo.upsertGame({
    projectId,
    versionNo: body.versionNo,
    name,
    coverPath: body.coverPath ?? null,
    coverMime: body.coverMime ?? null,
    coverSize: body.coverSize ?? null,
    coverWidth: body.coverWidth ?? null,
    coverHeight: body.coverHeight ?? null,
    difficulty: body.difficulty,
    gridSize: version.grid_size,
    snapshot: version.data as MapDraft,
  });
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

/** FEAT-G02 §5.3: the works table flags rows that already have a game. */
export async function deployedProjectIds(): Promise<Set<number>> {
  return gameRepo.listDeployedProjectIds();
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
