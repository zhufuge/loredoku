import type { Knex } from 'knex';
import { db } from '../db/knex';
import { buildFileUrl, buildThumbUrl } from '../utils/paths';
import type {
  Item,
  ItemFitMode,
  ItemTrigger,
  ItemTriggerInput,
  ItemTriggerRow,
  ItemRow,
  ItemUsage,
  MapDraft,
} from '@loredoku/shared';

export interface ListItemsParams {
  keyword?: string;
  isActive?: boolean;
  category?: string;
}

export interface CreateItemData {
  code: string;
  name: string;
  category: string;
  widthCells: number;
  heightCells: number;
  canStand: boolean;
  fitMode: ItemFitMode;
  meta: Record<string, unknown>;
  triggers: ItemTriggerInput[];
}

export interface UpdateItemData {
  name?: string;
  category?: string;
  widthCells?: number;
  heightCells?: number;
  canStand?: boolean;
  fitMode?: ItemFitMode;
  meta?: Record<string, unknown>;
  isActive?: boolean;
}

export interface ItemImageData {
  path: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
}

function toTrigger(row: ItemTriggerRow): ItemTrigger {
  return {
    id: Number(row.id),
    triggerKey: row.trigger_key,
    triggerValue: row.trigger_value,
    effectType: row.effect_type,
    effectConfig: row.effect_config ?? {},
  };
}

function toItem(row: ItemRow, triggers: ItemTrigger[]): Item {
  return {
    id: Number(row.id),
    code: row.code,
    name: row.name,
    category: row.category,
    widthCells: row.width_cells,
    heightCells: row.height_cells,
    canStand: row.can_stand,
    fitMode: row.fit_mode,
    imagePath: row.image_path,
    imageUrl: row.image_path ? buildFileUrl(row.image_path) : null,
    imageThumbUrl: row.image_path ? buildThumbUrl(row.image_path) : null,
    imageMime: row.image_mime,
    imageSize: row.image_size,
    imageWidth: row.image_width,
    imageHeight: row.image_height,
    meta: row.meta ?? {},
    isActive: row.is_active,
    triggers,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

async function findTriggers(itemId: number): Promise<ItemTrigger[]> {
  const rows = await db<ItemTriggerRow>('item_triggers').where({ item_id: itemId }).orderBy('id');
  return rows.map(toTrigger);
}

export async function listItems(params: ListItemsParams): Promise<Item[]> {
  const query = db<ItemRow>('items');
  if (params.isActive !== undefined) query.where('is_active', params.isActive);
  if (params.category) query.where('category', params.category);
  if (params.keyword) {
    const pattern = `%${params.keyword}%`;
    query.where((builder) => {
      builder.where('name', 'ilike', pattern).orWhere('code', 'ilike', pattern);
    });
  }

  const rows = await query.orderBy('updated_at', 'desc').select('*');
  if (rows.length === 0) return [];

  const ids = rows.map((row) => Number(row.id));
  const triggerRows = await db<ItemTriggerRow>('item_triggers')
    .whereIn('item_id', ids)
    .orderBy('id');
  const byItem = new Map<number, ItemTrigger[]>();
  for (const trigger of triggerRows) {
    const itemId = Number(trigger.item_id);
    const list = byItem.get(itemId);
    if (list) list.push(toTrigger(trigger));
    else byItem.set(itemId, [toTrigger(trigger)]);
  }

  return rows.map((row) => toItem(row, byItem.get(Number(row.id)) ?? []));
}

export async function findById(id: number): Promise<ItemRow | undefined> {
  return db<ItemRow>('items').where({ id }).first();
}

export async function findByCode(code: string): Promise<ItemRow | undefined> {
  return db<ItemRow>('items').where({ code }).first();
}

export async function getItem(id: number): Promise<Item | null> {
  const row = await findById(id);
  if (!row) return null;
  return toItem(row, await findTriggers(id));
}

export async function create(data: CreateItemData): Promise<number> {
  return db.transaction(async (trx) => {
    const [row] = await trx('items')
      .insert({
        code: data.code,
        name: data.name,
        category: data.category,
      width_cells: data.widthCells,
      height_cells: data.heightCells,
      can_stand: data.canStand,
      fit_mode: data.fitMode,
      meta: data.meta,
        // OPT-305: 新建物品未上传图片，初始状态为停用；上传图片后需手动启用。
        is_active: false,
      })
      .returning('id');
    const id = Number((row as { id: number | string }).id);
    if (data.triggers.length > 0) {
      await trx('item_triggers').insert(
        data.triggers.map((trigger) => ({
          item_id: id,
          trigger_key: trigger.triggerKey,
          trigger_value: trigger.triggerValue,
          effect_type: trigger.effectType,
          effect_config: trigger.effectConfig,
        })),
      );
    }
    return id;
  });
}

export async function update(id: number, data: UpdateItemData): Promise<boolean> {
  const patch: Record<string, unknown> = { updated_at: db.fn.now() };
  if (data.name !== undefined) patch.name = data.name;
  if (data.category !== undefined) patch.category = data.category;
  if (data.widthCells !== undefined) patch.width_cells = data.widthCells;
  if (data.heightCells !== undefined) patch.height_cells = data.heightCells;
  if (data.canStand !== undefined) patch.can_stand = data.canStand;
  if (data.fitMode !== undefined) patch.fit_mode = data.fitMode;
  if (data.meta !== undefined) patch.meta = data.meta;
  if (data.isActive !== undefined) patch.is_active = data.isActive;
  const affected = await db('items').where({ id }).update(patch);
  return affected > 0;
}

export async function setImage(id: number, image: ProcessedImageAlias): Promise<void> {
  await db('items').where({ id }).update({
    image_path: image.path,
    image_mime: image.mime,
    image_size: image.size,
    image_width: image.width,
    image_height: image.height,
    updated_at: db.fn.now(),
  });
}

export async function clearImage(id: number): Promise<void> {
  await db('items').where({ id }).update({
    image_path: null,
    image_mime: null,
    image_size: null,
    image_width: null,
    image_height: null,
    // OPT-305: 删除图片后自动停用（数据引用保留）。
    is_active: false,
    updated_at: db.fn.now(),
  });
}

export async function replaceTriggers(itemId: number, triggers: ItemTriggerInput[]): Promise<void> {
  await db.transaction(async (trx) => {
    await trx('item_triggers').where({ item_id: itemId }).del();
    if (triggers.length > 0) {
      await trx('item_triggers').insert(
        triggers.map((trigger) => ({
          item_id: itemId,
          trigger_key: trigger.triggerKey,
          trigger_value: trigger.triggerValue,
          effect_type: trigger.effectType,
          effect_config: trigger.effectConfig,
        })),
      );
    }
  });
}

export interface ProcessedImageAlias {
  path: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
}

export async function clearItemFromDrafts(trx: Knex.Transaction, id: number): Promise<void> {
  const projects = (await trx('map_projects')
    .whereNotNull('draft_data')
    .select('id', 'draft_data')) as Array<{ id: string | number; draft_data: unknown }>;
  for (const project of projects) {
    const draft = project.draft_data as MapDraft | null;
    if (!draft?.cells) continue;
    let changed = false;
    for (const key of Object.keys(draft.cells)) {
      const cell = draft.cells[key];
      if (!cell) continue;
      if (cell.object?.itemId === id || cell.background?.itemId === id) {
        const next = { ...cell };
        if (cell.object?.itemId === id) delete next.object;
        if (cell.background?.itemId === id) delete next.background;
        if (!next.object && !next.objectRef && !next.background) delete draft.cells[key];
        else draft.cells[key] = next;
        changed = true;
      }
    }
    if (changed) {
      await trx('map_projects')
        .where({ id: project.id })
        .update({ draft_data: draft, draft_updated_at: trx.fn.now() });
    }
  }
}

export async function setActive(id: number, isActive: boolean): Promise<boolean> {
  const affected = await db('items')
    .where({ id })
    .update({ is_active: isActive, updated_at: db.fn.now() });
  return affected > 0;
}

export async function softDelete(id: number, clearReferences: boolean): Promise<boolean> {
  return db.transaction(async (trx) => {
    if (clearReferences) {
      await clearItemFromDrafts(trx, id);
    }
    const affected = await trx('items')
      .where({ id })
      .update({ is_active: false, updated_at: trx.fn.now() });
    return affected > 0;
  });
}

export async function hardDelete(id: number, clearReferences: boolean): Promise<boolean> {
  return db.transaction(async (trx) => {
    if (clearReferences) {
      await clearItemFromDrafts(trx, id);
    }
    await trx('item_triggers').where({ item_id: id }).del();
    const affected = await trx('items').where({ id }).del();
    return affected > 0;
  });
}

export async function isReferenced(id: number): Promise<boolean> {
  const usages = await getUsages(id);
  return usages.length > 0;
}

export async function getUsages(itemId: number): Promise<ItemUsage[]> {
  const projects = (await db('map_projects')
    .whereNotNull('draft_data')
    .select('id', 'name', 'draft_data')) as Array<{
    id: string | number;
    name: string;
    draft_data: MapDraft | null;
  }>;

  const usages: ItemUsage[] = [];
  for (const project of projects) {
    const draft = project.draft_data;
    if (!draft?.cells) continue;
    const cells: Array<{ x: number; y: number }> = [];
    for (const key of Object.keys(draft.cells)) {
      const cell = draft.cells[key];
      if (cell?.object?.itemId === itemId || cell?.background?.itemId === itemId) {
        const [xs, ys] = key.split(',');
        cells.push({ x: Number(xs), y: Number(ys) });
      }
    }
    if (cells.length > 0) {
      usages.push({ projectId: Number(project.id), projectName: project.name, cells });
    }
  }
  return usages;
}

export async function existingItemIds(ids: number[]): Promise<Set<number>> {
  if (ids.length === 0) return new Set();
  const rows = (await db('items').whereIn('id', ids).select('id')) as Array<{ id: number | string }>;
  return new Set(rows.map((row) => Number(row.id)));
}

export interface ItemMeta {
  canStand: boolean;
  isActive: boolean;
}

export async function itemMetaByIds(ids: number[]): Promise<Map<number, ItemMeta>> {
  if (ids.length === 0) return new Map();
  const rows = (await db('items').whereIn('id', ids).select('id', 'can_stand', 'is_active')) as Array<{
    id: number | string;
    can_stand: boolean;
    is_active: boolean;
  }>;
  return new Map(rows.map((row) => [Number(row.id), { canStand: row.can_stand, isActive: row.is_active }]));
}
