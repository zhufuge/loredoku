import { db } from '../db/knex';
import type { PuzzleDraft, PuzzleRow } from '@loredoku/shared';

/**
 * v0.5.0 FEAT-K01 (docs/v0.5.0.md §2.1 / §2.2) — the `puzzles` table.
 *
 * A puzzle owns the roster and the palette and only **references** a published
 * map version (`map_project_id` + `map_version_no`), so `grid_size` is
 * denormalised from that version: it is both the roster length and the bound
 * every position condition is checked against.
 *
 * `name` / `description` live in the row **and** inside the JSON draft (the
 * exported file has to be self-describing), so renames go through a single
 * transaction that patches both.
 */

/** The joined row shape `listPuzzles` / `getPuzzleRow` return. */
export interface PuzzleJoinedRow extends PuzzleRow {
  map_name: string | null;
  root_id: string | number;
  game_slug: string | null;
}

const PUZZLE_SELECT = [
  'pz.*',
  'mp.name as map_name',
  'mp.root_id as root_id',
  'g.slug as game_slug',
] as const;

function baseQuery() {
  return db('puzzles as pz')
    .join('map_projects as mp', 'mp.id', 'pz.map_project_id')
    .leftJoin('map_games as g', 'g.puzzle_id', 'pz.id');
}

export async function listPuzzles(): Promise<PuzzleJoinedRow[]> {
  return (await baseQuery()
    .select(...PUZZLE_SELECT)
    .orderBy('pz.created_at', 'desc')) as PuzzleJoinedRow[];
}

export async function getPuzzleRow(id: number): Promise<PuzzleJoinedRow | undefined> {
  const row = await baseQuery().where('pz.id', id).select(...PUZZLE_SELECT).first();
  return row as PuzzleJoinedRow | undefined;
}

export async function findPuzzleByName(
  mapProjectId: number,
  mapVersionNo: number,
  name: string,
): Promise<PuzzleRow | undefined> {
  return db<PuzzleRow>('puzzles')
    .where({ map_project_id: mapProjectId, map_version_no: mapVersionNo, name })
    .first();
}

export interface CreatePuzzleData {
  name: string;
  description: string;
  mapProjectId: number;
  mapVersionNo: number;
  gridSize: number;
  data: PuzzleDraft;
}

export async function createPuzzle(input: CreatePuzzleData): Promise<PuzzleJoinedRow> {
  const [row] = (await db('puzzles')
    .insert({
      name: input.name,
      description: input.description,
      map_project_id: input.mapProjectId,
      map_version_no: input.mapVersionNo,
      grid_size: input.gridSize,
      data: input.data,
      status: 'draft',
    })
    .returning('id')) as Array<{ id: string | number }>;
  const created = await getPuzzleRow(Number(row!.id));
  if (!created) throw new Error('谜题创建后读取失败');
  return created;
}

/**
 * Optimistic-concurrency save, mirroring `mapRepository.saveDraft`:
 * `undefined` → not found, `null` → stale `expectedUpdatedAt`.
 *
 * `name` / `description` are mirrored from the JSON so the list row and the
 * exported file can never drift apart.
 */
export async function savePuzzleDraft(
  id: number,
  expectedUpdatedAt: string | null,
  data: PuzzleDraft,
): Promise<PuzzleJoinedRow | null | undefined> {
  const stale = await db.transaction(async (trx) => {
    const row = (await trx('puzzles').where({ id }).forUpdate().first()) as PuzzleRow | undefined;
    if (!row) return 'missing' as const;

    const current = row.updated_at ? new Date(row.updated_at).toISOString() : null;
    if ((expectedUpdatedAt ?? null) !== current) return 'stale' as const;

    await trx('puzzles')
      .where({ id })
      .update({
        name: data.name,
        description: data.description,
        data,
        updated_at: trx.fn.now(),
      });
    return 'saved' as const;
  });

  if (stale === 'missing') return undefined;
  if (stale === 'stale') return null;
  return getPuzzleRow(id);
}

export interface UpdatePuzzleData {
  name?: string;
  description?: string | null;
}

export async function updatePuzzle(
  id: number,
  patch: UpdatePuzzleData,
): Promise<PuzzleJoinedRow | undefined> {
  const updated = await db.transaction(async (trx) => {
    const row = (await trx('puzzles').where({ id }).forUpdate().first()) as PuzzleRow | undefined;
    if (!row) return false;

    const columns: Record<string, unknown> = { updated_at: trx.fn.now() };
    if (patch.name !== undefined) columns['name'] = patch.name;
    if (patch.description !== undefined) columns['description'] = patch.description;

    const data = isPuzzleDraft(row.data) ? { ...row.data } : null;
    if (data) {
      if (patch.name !== undefined) data.name = patch.name;
      if (patch.description !== undefined) data.description = patch.description ?? '';
      columns['data'] = data;
    }

    await trx('puzzles').where({ id }).update(columns);
    return true;
  });
  return updated ? getPuzzleRow(id) : undefined;
}

export async function deletePuzzle(id: number): Promise<boolean> {
  const affected = await db('puzzles').where({ id }).del();
  return affected > 0;
}

export async function duplicatePuzzle(
  sourceId: number,
  newName: string,
): Promise<PuzzleJoinedRow | undefined> {
  const createdId = await db.transaction(async (trx) => {
    const source = (await trx('puzzles').where({ id: sourceId }).first()) as PuzzleRow | undefined;
    if (!source) return undefined;

    const data = isPuzzleDraft(source.data) ? { ...source.data, name: newName } : null;
    const [row] = (await trx('puzzles')
      .insert({
        name: newName,
        description: source.description,
        map_project_id: source.map_project_id,
        map_version_no: source.map_version_no,
        grid_size: source.grid_size,
        data,
        status: 'draft',
      })
      .returning('id')) as Array<{ id: string | number }>;
    return Number(row!.id);
  });

  return createdId === undefined ? undefined : getPuzzleRow(createdId);
}

/** `true` when the raw JSON looks like a `PuzzleDraft` (roster array present). */
export function isPuzzleDraft(raw: unknown): raw is PuzzleDraft {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return false;
  return Array.isArray((raw as PuzzleDraft).characterSlots);
}
