import { db } from '../db/knex';
import { buildFileUrl } from '../utils/paths';
import type {
  GameDifficulty,
  MapDraft,
  MapGameDetail,
  MapGameRow,
  MapGameSummary,
} from '@loredoku/shared';

/** FEAT-G02: the games home page lists every deployed game, newest first. */
export async function listGames(): Promise<MapGameSummary[]> {
  const rows = (await db<MapGameRow>('map_games').orderBy('created_at', 'desc')) as MapGameRow[];
  return rows.map(toSummary);
}

export async function getGameRow(id: number): Promise<MapGameRow | undefined> {
  return db<MapGameRow>('map_games').where({ id }).first();
}

/** The works table marks a row as deployed when a game exists for its map. */
export async function listDeployedProjectIds(): Promise<Set<number>> {
  const rows = (await db('map_games').select('project_id')) as Array<{ project_id: number | string }>;
  return new Set(rows.map((row) => Number(row.project_id)));
}

export async function getGameByProject(projectId: number): Promise<MapGameRow | undefined> {
  return db<MapGameRow>('map_games').where({ project_id: projectId }).first();
}

export interface UpsertGameData {
  projectId: number;
  versionNo: number;
  name: string;
  coverPath: string | null;
  coverMime: string | null;
  coverSize: number | null;
  coverWidth: number | null;
  coverHeight: number | null;
  difficulty: GameDifficulty;
  gridSize: number;
  snapshot: MapDraft;
}

/**
 * FEAT-G02 §5.1: one deployed game per map. Deploying another version of the
 * same map **overwrites** the previous row, so the insert and the delete share
 * a transaction and the row gets a fresh id.
 */
export async function upsertGame(data: UpsertGameData): Promise<MapGameSummary> {
  return db.transaction(async (trx) => {
    await trx('map_games').where({ project_id: data.projectId }).del();
    const [row] = (await trx('map_games')
      .insert({
        project_id: data.projectId,
        version_no: data.versionNo,
        name: data.name,
        cover_path: data.coverPath,
        cover_mime: data.coverMime,
        cover_size: data.coverSize,
        cover_width: data.coverWidth,
        cover_height: data.coverHeight,
        difficulty: data.difficulty,
        grid_size: data.gridSize,
        snapshot: data.snapshot,
      })
      .returning('*')) as MapGameRow[];
    return toSummary(row!);
  });
}

export async function updateGameCover(
  id: number,
  cover: { path: string; mime: string; size: number; width: number | null; height: number | null },
): Promise<MapGameRow | undefined> {
  const [row] = (await db<MapGameRow>('map_games')
    .where({ id })
    .update({
      cover_path: cover.path,
      cover_mime: cover.mime,
      cover_size: cover.size,
      cover_width: cover.width,
      cover_height: cover.height,
      updated_at: db.fn.now(),
    })
    .returning('*')) as MapGameRow[];
  return row;
}

export function toSummary(row: MapGameRow): MapGameSummary {
  const snapshot = row.snapshot;
  return {
    id: Number(row.id),
    projectId: Number(row.project_id),
    versionNo: row.version_no,
    name: row.name,
    coverUrl: row.cover_path ? buildFileUrl(row.cover_path) : null,
    difficulty: row.difficulty,
    gridSize: row.grid_size,
    participantCount: (snapshot?.characterSlots ?? []).filter((slot) => slot !== null).length,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export function toDetail(row: MapGameRow): MapGameDetail {
  return {
    ...toSummary(row),
    // The game page renders the snapshot exactly as it was deployed.
    data: row.snapshot,
  };
}
