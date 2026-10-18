import { db } from '../db/knex';
import { buildFileUrl } from '../utils/paths';
import type {
  GameDifficulty,
  MapGameDetail,
  MapGameRow,
  MapGameSnapshot,
  MapGameSummary,
} from '@loredoku/shared';
import { toGameSnapshot } from '../service/gameSnapshotCompat';

/** FEAT-G02: the games home page lists every deployed game, newest first. */
export async function listGames(): Promise<MapGameSummary[]> {
  const rows = (await db<MapGameRow>('games').orderBy('created_at', 'desc')) as MapGameRow[];
  return rows.map(toSummary);
}

export async function getGameRow(id: number): Promise<MapGameRow | undefined> {
  return db<MapGameRow>('games').where({ id }).first();
}

/** OPT-W04: the game page is addressed by its access path, not its id. */
export async function getGameRowBySlug(slug: string): Promise<MapGameRow | undefined> {
  return db<MapGameRow>('games').where({ slug }).first();
}

/** OPT-W04 §4.4: who owns a path — another puzzle is a clash. */
export async function findGameBySlug(slug: string): Promise<MapGameRow | undefined> {
  return db<MapGameRow>('games').where({ slug }).first();
}

/** CONS-K16: one game per puzzle, so the lookup is by `puzzle_id`. */
export async function getGameByPuzzle(puzzleId: number): Promise<MapGameRow | undefined> {
  return db<MapGameRow>('games').where({ puzzle_id: puzzleId }).first();
}

export interface UpsertGameData {
  /** CONS-K16: the unit of deployment. */
  puzzleId: number;
  /** The referenced map version — kept denormalised for badges / keys. */
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
  snapshot: MapGameSnapshot;
}

/**
 * CONS-K16 (docs/v0.5.0.md §10.1): one deployed game per **puzzle**. Deploying
 * again overwrites the previous row, so the insert and the delete share a
 * transaction and the row gets a fresh id.
 *
 * OPT-W03 §3: the cover follows a three-way rule — `clearCover` drops it, a
 * supplied `coverPath` replaces it, and neither keeps whatever was stored.
 */
export async function upsertGame(data: UpsertGameData): Promise<MapGameSummary> {
  return db.transaction(async (trx) => {
    const previous = (await trx<MapGameRow>('games')
      .where({ puzzle_id: data.puzzleId })
      .first()) as MapGameRow | undefined;

    const cover = resolveCover(previous, data);

    await trx('games').where({ puzzle_id: data.puzzleId }).del();
    const [row] = (await trx('games')
      .insert({
        puzzle_id: data.puzzleId,
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
  const [row] = (await db<MapGameRow>('games')
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

/** CONS-K16: the roster comes from the puzzle, or from a legacy map snapshot. */
export function snapshotParticipants(snapshot: MapGameSnapshot): number {
  const slots = snapshot.puzzle?.characterSlots ?? snapshot.legacyCharacterSlots ?? [];
  return slots.filter((slot) => slot !== null).length;
}

export function toSummary(row: MapGameRow): MapGameSummary {
  const snapshot = toGameSnapshot(row.snapshot);
  return {
    id: Number(row.id),
    puzzleId: row.puzzle_id === null || row.puzzle_id === undefined ? null : Number(row.puzzle_id),
    projectId: Number(row.project_id),
    versionNo: row.version_no,
    name: row.name,
    slug: row.slug,
    coverUrl: row.cover_path ? buildFileUrl(row.cover_path) : null,
    difficulty: row.difficulty,
    gridSize: row.grid_size,
    participantCount: snapshotParticipants(snapshot),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export function toDetail(row: MapGameRow): MapGameDetail {
  return {
    ...toSummary(row),
    // The game page renders the snapshot exactly as it was deployed, upgraded
    // to the current shape (legacy rosters become `legacyCharacterSlots`).
    snapshot: toGameSnapshot(row.snapshot),
  };
}
