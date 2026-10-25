import type { Knex } from 'knex';
import { db } from '../db/knex';
import { buildFileUrl, buildThumbUrl } from '../utils/paths';
import type {
  Character,
  CharacterGender,
  CharacterRow,
  CharacterUsage,
} from '@loredoku/shared';
import { absorbLegacyPuzzleDraft } from '@loredoku/shared';
import { readLegacyCharacterSlots } from '../service/mapDraftCompat';

export interface ListCharactersParams {
  keyword?: string;
  isActive?: boolean;
}

export interface CreateCharacterData {
  code: string;
  name: string;
  /** FEAT-501 */
  gender: CharacterGender;
  description: string | null;
  /** v0.5.1 FEAT-L02: colour-block colour; `null` / omitted = image mode. */
  bgColor?: string | null;
  /**
   * v0.5.3 FEAT-N06: create enabled when the caller already supplied an
   * appearance; omitted keeps the OPT-305 default (`false`).
   */
  isActive?: boolean;
}

export interface UpdateCharacterData {
  name?: string;
  gender?: CharacterGender;
  description?: string | null;
  /** v0.5.1 FEAT-L02: `null` clears the colour block (back to image mode). */
  bgColor?: string | null;
  isActive?: boolean;
}

function toCharacter(row: CharacterRow): Character {
  return {
    id: Number(row.id),
    code: row.code,
    name: row.name,
    gender: row.gender,
    description: row.description,
    avatarPath: row.avatar_path,
    avatarUrl: row.avatar_path ? buildFileUrl(row.avatar_path) : null,
    avatarThumbUrl: row.avatar_path ? buildThumbUrl(row.avatar_path) : null,
    bgColor: row.bg_color ?? null,
    isActive: row.is_active,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function listCharacters(params: ListCharactersParams): Promise<Character[]> {
  const query = db<CharacterRow>('characters');
  if (params.isActive !== undefined) query.where('is_active', params.isActive);
  if (params.keyword) {
    const pattern = `%${params.keyword}%`;
    query.where((builder) => {
      builder.where('name', 'ilike', pattern).orWhere('code', 'ilike', pattern);
    });
  }
  const rows = await query.orderBy('updated_at', 'desc').select('*');
  return rows.map(toCharacter);
}

export async function findById(id: number): Promise<CharacterRow | undefined> {
  return db<CharacterRow>('characters').where({ id }).first();
}

export async function findByCode(code: string): Promise<CharacterRow | undefined> {
  return db<CharacterRow>('characters').where({ code }).first();
}

export async function getCharacter(id: number): Promise<Character | null> {
  const row = await findById(id);
  return row ? toCharacter(row) : null;
}

export async function create(data: CreateCharacterData): Promise<number> {
  const [row] = await db('characters')
    .insert({
      code: data.code,
      name: data.name,
      gender: data.gender,
      description: data.description,
      bg_color: data.bgColor ?? null,
      // OPT-305: 新建角色未上传头像，初始状态为停用。
      // v0.5.3 FEAT-N06: 上传了头像或选了纯色块 → 直接启用。
      is_active: data.isActive ?? false,
    })
    .returning('id');
  return Number((row as { id: number | string }).id);
}

export async function update(id: number, data: UpdateCharacterData): Promise<boolean> {
  const patch: Record<string, unknown> = { updated_at: db.fn.now() };
  if (data.name !== undefined) patch.name = data.name;
  if (data.gender !== undefined) patch.gender = data.gender;
  if (data.description !== undefined) patch.description = data.description;
  if (data.bgColor !== undefined) patch.bg_color = data.bgColor;
  if (data.isActive !== undefined) patch.is_active = data.isActive;
  const affected = await db('characters').where({ id }).update(patch);
  return affected > 0;
}

export async function setAvatar(id: number, relativePath: string): Promise<void> {
  await db('characters').where({ id }).update({
    avatar_path: relativePath,
    updated_at: db.fn.now(),
  });
}

export async function clearAvatar(id: number): Promise<void> {
  await db('characters').where({ id }).update({
    avatar_path: null,
    // OPT-305: 删除头像后自动停用（数据引用保留）。
    // v0.5.1 FEAT-L02 收窄：纯色块（有 bg_color）不依赖头像，删头像只是删头像。
    is_active: db.raw('CASE WHEN bg_color IS NULL THEN false ELSE is_active END'),
    updated_at: db.fn.now(),
  });
}

export async function softDelete(id: number): Promise<boolean> {
  const affected = await db('characters')
    .where({ id })
    .update({ is_active: false, updated_at: db.fn.now() });
  return affected > 0;
}

export async function setActive(id: number, isActive: boolean): Promise<boolean> {
  const affected = await db('characters')
    .where({ id })
    .update({ is_active: isActive, updated_at: db.fn.now() });
  return affected > 0;
}

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

/**
 * the roster moved from the map draft to the puzzle, so a character can
 * be referenced in **two** places while stored data ages:
 *
 * - `puzzles.data.characterSlots` — where it lives now;
 * - `maps.data.characterSlots` — v0.4.x drafts, still in the
 *   database (the reader ignores them, but they must not keep a dangling
 *   character id after a hard delete).
 */
export async function clearCharacterFromDrafts(trx: Knex.Transaction, id: number): Promise<void> {
  const puzzles = (await trx('puzzles')
    .whereNotNull('data')
    .select('id', 'data')) as Array<{ id: string | number; data: unknown }>;
  for (const puzzle of puzzles) {
    const record = asRecord(puzzle.data);
    const slots = Array.isArray(record?.['characterSlots'])
      ? (record['characterSlots'] as Array<{ characterId: number } | null>)
      : null;
    if (!record || !slots) continue;
    const next = slots.map((slot) => (slot && slot.characterId === id ? null : slot));
    if (JSON.stringify(next) === JSON.stringify(slots)) continue;
    await trx('puzzles')
      .where({ id: puzzle.id })
      .update({ data: { ...record, characterSlots: next }, updated_at: trx.fn.now() });
  }

  const mapRows = (await trx('maps')
    .where('version', 'draft')
    .whereNotNull('data')
    .select('id', 'data')) as Array<{ id: string | number; data: unknown }>;
  for (const mapRow of mapRows) {
    const record = asRecord(mapRow.data);
    if (!record) continue;
    const slots = readLegacyCharacterSlots(record);
    if (slots.length === 0) continue;
    const next = slots.map((slot) => (slot && slot.characterId === id ? null : slot));
    if (JSON.stringify(next) === JSON.stringify(slots)) continue;
    await trx('maps').where({ id: mapRow.id }).update({
      data: { ...record, characterSlots: next },
    });
  }
}

export async function hardDelete(id: number, clearReferences: boolean): Promise<boolean> {
  return db.transaction(async (trx) => {
    if (clearReferences) {
      await clearCharacterFromDrafts(trx, id);
    }
    const affected = await trx('characters').where({ id }).del();
    return affected > 0;
  });
}

/**
 * FEAT-K01: where a character is used. v0.5.0 reads **puzzles** first (the
 * roster's new home) and reports any v0.4.x map draft that still holds one, so
 * a hard delete never leaves a dangling reference behind.
 *
 * v0.7.1: 谜题自带底图，所以「在哪张图上」直接读 `data.map` 快照，不再 join
 * `maps`；软删的版本行不算使用（它已经不在界面上）。
 */
export async function getUsages(characterId: number): Promise<CharacterUsage[]> {
  const puzzleRows = (await db('puzzles')
    .whereNull('deleted_at')
    .select('id', 'name', 'data')) as Array<{
    id: string | number;
    name: string;
    data: unknown;
  }>;

  const usages: CharacterUsage[] = [];
  for (const row of puzzleRows) {
    const draft = absorbLegacyPuzzleDraft(row.data);
    if (!draft) continue;
    if (!draft.characterSlots.some((slot) => slot?.characterId === characterId)) continue;
    usages.push({
      puzzleId: Number(row.id),
      puzzleName: row.name,
      mapId: draft.map.mapId,
      mapName: draft.map.mapName || '未命名地图',
      // CLAR-603: participants no longer occupy cells.
      cells: [],
    });
  }

  const mapRows = (await db('maps')
    .where('version', 'draft')
    .whereNotNull('data')
    .select('id', 'name', 'data')) as Array<{
    id: string | number;
    name: string;
    data: unknown;
  }>;
  for (const mapRow of mapRows) {
    const slots = readLegacyCharacterSlots(mapRow.data);
    if (!slots.some((slot) => slot?.characterId === characterId)) continue;
    usages.push({
      legacy: true,
      mapId: Number(mapRow.id),
      mapName: mapRow.name,
      cells: [],
    });
  }
  return usages;
}

export async function existingCharacterIds(ids: number[]): Promise<Set<number>> {
  if (ids.length === 0) return new Set();
  const rows = (await db('characters').whereIn('id', ids).select('id')) as Array<{ id: number | string }>;
  return new Set(rows.map((row) => Number(row.id)));
}

export interface CharacterSlotMeta {
  hasAvatar: boolean;
  /** v0.5.1 FEAT-L02: a colour block counts as an appearance too. */
  hasAppearance: boolean;
}

/**
 * CLAR-603 P2 (docs/v0.3.1.md §3.3): participants without an avatar are
 * treated as not enabled and are not counted. v0.5.1 FEAT-L02 widens it —
 * a **colour block** is a valid appearance as well, so `hasAppearance` is the
 * value to test. Only ids that exist are present in the returned map.
 */
export async function characterSlotMetaByIds(
  ids: number[],
): Promise<Map<number, CharacterSlotMeta>> {
  const meta = new Map<number, CharacterSlotMeta>();
  if (ids.length === 0) return meta;
  const rows = (await db('characters').whereIn('id', ids).select('id', 'avatar_path', 'bg_color')) as Array<{
    id: number | string;
    avatar_path: string | null;
    bg_color: string | null;
  }>;
  for (const row of rows) {
    const hasAvatar = row.avatar_path !== null;
    meta.set(Number(row.id), { hasAvatar, hasAppearance: hasAvatar || row.bg_color !== null });
  }
  return meta;
}
