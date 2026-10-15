import type { Knex } from 'knex';
import { db } from '../db/knex';
import { buildFileUrl, buildThumbUrl } from '../utils/paths';
import type {
  Character,
  CharacterGender,
  CharacterRow,
  CharacterUsage,
  MapDraft,
} from '@murdoku/shared';

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
  meta: Record<string, unknown>;
}

export interface UpdateCharacterData {
  name?: string;
  gender?: CharacterGender;
  description?: string | null;
  meta?: Record<string, unknown>;
  isActive?: boolean;
}

export interface CharacterImageData {
  path: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
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
    avatarMime: row.avatar_mime,
    avatarSize: row.avatar_size,
    avatarWidth: row.avatar_width,
    avatarHeight: row.avatar_height,
    meta: row.meta ?? {},
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
      meta: data.meta,
      // OPT-305: 新建角色未上传头像，初始状态为停用；上传头像后需手动启用。
      is_active: false,
    })
    .returning('id');
  return Number((row as { id: number | string }).id);
}

export async function update(id: number, data: UpdateCharacterData): Promise<boolean> {
  const patch: Record<string, unknown> = { updated_at: db.fn.now() };
  if (data.name !== undefined) patch.name = data.name;
  if (data.gender !== undefined) patch.gender = data.gender;
  if (data.description !== undefined) patch.description = data.description;
  if (data.meta !== undefined) patch.meta = data.meta;
  if (data.isActive !== undefined) patch.is_active = data.isActive;
  const affected = await db('characters').where({ id }).update(patch);
  return affected > 0;
}

export async function setAvatar(id: number, image: CharacterImageData): Promise<void> {
  await db('characters').where({ id }).update({
    avatar_path: image.path,
    avatar_mime: image.mime,
    avatar_size: image.size,
    avatar_width: image.width,
    avatar_height: image.height,
    updated_at: db.fn.now(),
  });
}

export async function clearAvatar(id: number): Promise<void> {
  await db('characters').where({ id }).update({
    avatar_path: null,
    avatar_mime: null,
    avatar_size: null,
    avatar_width: null,
    avatar_height: null,
    // OPT-305: 删除头像后自动停用（数据引用保留）。
    is_active: false,
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

export async function clearCharacterFromDrafts(trx: Knex.Transaction, id: number): Promise<void> {
  const projects = (await trx('map_projects')
    .whereNotNull('draft_data')
    .select('id', 'draft_data')) as Array<{ id: string | number; draft_data: MapDraft | null }>;
  for (const project of projects) {
    const draft = project.draft_data;
    if (!draft) continue;
    let changed = false;
    // CLAR-603: participants live in the roster; remove any slot referencing
    // the deleted character. Legacy `placedCharacters` is migrated away, so
    // we only touch `characterSlots`.
    const characterSlots = (draft.characterSlots ?? []).map((slot) =>
      slot && slot.characterId === id ? null : slot,
    );
    if (JSON.stringify(characterSlots) !== JSON.stringify(draft.characterSlots ?? [])) {
      draft.characterSlots = characterSlots;
      changed = true;
    }
    if (changed) {
      await trx('map_projects')
        .where({ id: project.id })
        .update({ draft_data: draft, draft_updated_at: trx.fn.now() });
    }
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

export async function getUsages(characterId: number): Promise<CharacterUsage[]> {
  const projects = (await db('map_projects')
    .whereNotNull('draft_data')
    .select('id', 'name', 'draft_data')) as Array<{
    id: string | number;
    name: string;
    draft_data: MapDraft | null;
  }>;

  const usages: CharacterUsage[] = [];
  for (const project of projects) {
    const slots = project.draft_data?.characterSlots ?? [];
    if (slots.some((slot) => slot?.characterId === characterId)) {
      usages.push({
        projectId: Number(project.id),
        projectName: project.name,
        // CLAR-603: participants no longer occupy cells; coordinates are
        // historical metadata only.
        cells: [],
      });
    }
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
}

/**
 * CLAR-603 P2 (docs/v0.3.1.md §3.3): participants without an avatar are
 * treated as not enabled and are not counted. Only ids that exist are
 * present in the returned map.
 */
export async function characterSlotMetaByIds(
  ids: number[],
): Promise<Map<number, CharacterSlotMeta>> {
  const meta = new Map<number, CharacterSlotMeta>();
  if (ids.length === 0) return meta;
  const rows = (await db('characters')
    .whereIn('id', ids)
    .select('id', 'avatar_path')) as Array<{ id: number | string; avatar_path: string | null }>;
  for (const row of rows) {
    meta.set(Number(row.id), { hasAvatar: row.avatar_path !== null });
  }
  return meta;
}
