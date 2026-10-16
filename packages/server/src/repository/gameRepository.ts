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

/** OPT-W04: the game page is addressed by its access path, not its id. */
export async function getGameRowBySlug(slug: string): Promise<MapGameRow | undefined> {
  return db<MapGameRow>('map_games').where({ slug }).first();
}

/**
 * OPT-W02 (docs/v0.4.1.md §2): the works table marks a row as deployed only
 * when **that version** was deployed, so the key is map + version number.
 */
export async function listDeployedVersionKeys(): Promise<Set<string>> {
  const rows = (await db('map_games').select('project_id', 'version_no')) as Array<{
    project_id: number | string;
    version_no: number;
  }>;
  return new Set(rows.map((row) => `${Number(row.project_id)}:${row.version_no}`));
}

/** OPT-W04 §4.4: who owns a path — anyone but this map is a clash. */
export async function findGameBySlug(slug: string): Promise<MapGameRow | undefined> {
  return db<MapGameRow>('map_games').where({ slug }).first();
}

export async function getGameByProject(projectId: number): Promise<MapGameRow | undefined> {
  return db<MapGameRow>('map_games').where({ project_id: projectId }).first();
}

export interface UpsertGameData {
  projectId: number;
  versionNo: number;
  name: string;
  /** OPT-W04: already validated and clash-checked by the service. */
  slug: string;
  /** OPT-W03: new cover bytes (post-upload) — `null` keeps / clears per below. */
  coverPath: string | null;
  coverMime: string | null;
  coverSize: number | null;
  coverWidth: number | null;
  coverHeight: number | null;
  /**
   * OPT-W03 §3: when true the stored cover is dropped. When false (default)
   * and no new cover is supplied, the previous cover is carried over — a
   * re-deploy must not silently lose the artwork the author already uploaded.
   */
  clearCover: boolean;
  difficulty: GameDifficulty;
  gridSize: number;
  snapshot: MapDraft;
}

/**
 * FEAT-G02 §5.1: one deployed game per map. Deploying another version of the
 * same map **overwrites** the previous row, so the insert and the delete share
 * a transaction and the row gets a fresh id.
 *
 * OPT-W03 §3: the cover follows a three-way rule — `clearCover` drops it, a
 * supplied `coverPath` replaces it, and neither keeps whatever was stored.
 */
export async function upsertGame(data: UpsertGameData): Promise<MapGameSummary> {
  return db.transaction(async (trx) => {
    const previous = (await trx<MapGameRow>('map_games')
      .where({ project_id: data.projectId })
      .first()) as MapGameRow | undefined;

    const cover = resolveCover(previous, data);

    await trx('map_games').where({ project_id: data.projectId }).del();
    const [row] = (await trx('map_games')
      .insert({
        project_id: data.projectId,
        version_no: data.versionNo,
        name: data.name,
        slug: data.slug,
        cover_path: cover.path,
        cover_mime: cover.mime,
        cover_size: cover.size,
        cover_width: cover.width,
        cover_height: cover.height,
        difficulty: data.difficulty,
        grid_size: data.gridSize,
        snapshot: data.snapshot,
      })
      .returning('*')) as MapGameRow[];
    return toSummary(row!);
  });
}

/** OPT-W03 §3: keep / replace / remove, in that precedence order. */
function resolveCover(
  previous: MapGameRow | undefined,
  data: UpsertGameData,
): {
  path: string | null;
  mime: string | null;
  size: number | null;
  width: number | null;
  height: number | null;
} {
  if (data.clearCover) {
    return { path: null, mime: null, size: null, width: null, height: null };
  }
  if (data.coverPath) {
    return {
      path: data.coverPath,
      mime: data.coverMime,
      size: data.coverSize,
      width: data.coverWidth,
      height: data.coverHeight,
    };
  }
  if (!previous) {
    return { path: null, mime: null, size: null, width: null, height: null };
  }
  return {
    path: previous.cover_path,
    mime: previous.cover_mime,
    size: previous.cover_size,
    width: previous.cover_width,
    height: previous.cover_height,
  };
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
    slug: row.slug,
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
