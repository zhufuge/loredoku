import type { Knex } from 'knex';
import { db } from '../db/knex';
import { buildFileUrl, buildThumbUrl } from '../utils/paths';
import type { Character, CharacterRow, CharacterUsage, MapDraft } from '@murdoku/shared';

export interface ListCharactersParams {
  keyword?: string;
  isActive?: boolean;
}

export interface CreateCharacterData {
  code: string;
  name: string;
  description: string | null;
  meta: Record<string, unknown>;
}

export interface UpdateCharacterData {
  name?: string;
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
      description: data.description,
      meta: data.meta,
      is_active: true,
    })
    .returning('id');
  return Number((row as { id: number | string }).id);
}

export async function update(id: number, data: UpdateCharacterData): Promise<boolean> {
  const patch: Record<string, unknown> = { updated_at: db.fn.now() };
  if (data.name !== undefined) patch.name = data.name;
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
    const placedCharacters = (draft.placedCharacters ?? []).filter(
      (placed) => placed.characterId !== id,
    );
    if (placedCharacters.length !== (draft.placedCharacters ?? []).length) {
      draft.placedCharacters = placedCharacters;
      changed = true;
    }
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
    const placed = project.draft_data?.placedCharacters ?? [];
    const matched = placed.filter((p) => p.characterId === characterId);
    if (matched.length > 0) {
      usages.push({
        projectId: Number(project.id),
        projectName: project.name,
        cells: matched.map((p) => ({ x: p.x, y: p.y })),
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
