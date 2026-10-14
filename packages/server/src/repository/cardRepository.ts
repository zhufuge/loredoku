import { db } from '../db/knex';
import { buildFileUrl, buildThumbUrl } from '../utils/paths';
import type {
  Card,
  CardRow,
  CardTrigger,
  CardTriggerInput,
  CardTriggerRow,
  CardUsage,
} from '@murdoku/shared';

export interface ListCardsParams {
  keyword?: string;
  isActive?: boolean;
}

export interface CreateCardData {
  code: string;
  name: string;
  meta: Record<string, unknown>;
  triggers: CardTriggerInput[];
}

export interface UpdateCardData {
  name?: string;
  meta?: Record<string, unknown>;
  isActive?: boolean;
}

export interface CardImageData {
  path: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
}

type CountRow = { count?: string | number } | undefined;

function toTrigger(row: CardTriggerRow): CardTrigger {
  return {
    id: Number(row.id),
    triggerKey: row.trigger_key,
    triggerValue: row.trigger_value,
    effectType: row.effect_type,
    effectConfig: row.effect_config ?? {},
  };
}

function toCard(row: CardRow, triggers: CardTrigger[]): Card {
  return {
    id: Number(row.id),
    code: row.code,
    name: row.name,
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

async function findTriggers(cardId: number): Promise<CardTrigger[]> {
  const rows = await db<CardTriggerRow>('card_triggers').where({ card_id: cardId }).orderBy('id');
  return rows.map(toTrigger);
}

export async function listCards(params: ListCardsParams): Promise<Card[]> {
  const query = db<CardRow>('cards');
  if (params.isActive !== undefined) {
    query.where('is_active', params.isActive);
  }
  if (params.keyword) {
    const pattern = `%${params.keyword}%`;
    query.where((builder) => {
      builder.where('name', 'ilike', pattern).orWhere('code', 'ilike', pattern);
    });
  }

  const rows = await query.orderBy('updated_at', 'desc').select('*');
  if (rows.length === 0) {
    return [];
  }

  const ids = rows.map((row) => Number(row.id));
  const triggerRows = await db<CardTriggerRow>('card_triggers')
    .whereIn('card_id', ids)
    .orderBy('id');
  const byCard = new Map<number, CardTrigger[]>();
  for (const trigger of triggerRows) {
    const cardId = Number(trigger.card_id);
    const list = byCard.get(cardId);
    if (list) {
      list.push(toTrigger(trigger));
    } else {
      byCard.set(cardId, [toTrigger(trigger)]);
    }
  }

  return rows.map((row) => toCard(row, byCard.get(Number(row.id)) ?? []));
}

export async function findById(id: number): Promise<CardRow | undefined> {
  return db<CardRow>('cards').where({ id }).first();
}

export async function findByCode(code: string): Promise<CardRow | undefined> {
  return db<CardRow>('cards').where({ code }).first();
}

export async function getCard(id: number): Promise<Card | null> {
  const row = await findById(id);
  if (!row) {
    return null;
  }
  return toCard(row, await findTriggers(id));
}

export async function create(data: CreateCardData): Promise<number> {
  return db.transaction(async (trx) => {
    const [row] = await trx('cards')
      .insert({ code: data.code, name: data.name, meta: data.meta, is_active: true })
      .returning('id');
    const id = Number((row as { id: number | string }).id);
    if (data.triggers.length > 0) {
      await trx('card_triggers').insert(
        data.triggers.map((trigger) => ({
          card_id: id,
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

export async function update(id: number, data: UpdateCardData): Promise<boolean> {
  const patch: Record<string, unknown> = { updated_at: db.fn.now() };
  if (data.name !== undefined) patch.name = data.name;
  if (data.meta !== undefined) patch.meta = data.meta;
  if (data.isActive !== undefined) patch.is_active = data.isActive;
  const affected = await db('cards').where({ id }).update(patch);
  return affected > 0;
}

export async function setImage(id: number, image: CardImageData): Promise<void> {
  await db('cards').where({ id }).update({
    image_path: image.path,
    image_mime: image.mime,
    image_size: image.size,
    image_width: image.width,
    image_height: image.height,
    updated_at: db.fn.now(),
  });
}

export async function clearImage(id: number): Promise<void> {
  await db('cards').where({ id }).update({
    image_path: null,
    image_mime: null,
    image_size: null,
    image_width: null,
    image_height: null,
    updated_at: db.fn.now(),
  });
}

export async function replaceTriggers(cardId: number, triggers: CardTriggerInput[]): Promise<void> {
  await db.transaction(async (trx) => {
    await trx('card_triggers').where({ card_id: cardId }).del();
    if (triggers.length > 0) {
      await trx('card_triggers').insert(
        triggers.map((trigger) => ({
          card_id: cardId,
          trigger_key: trigger.triggerKey,
          trigger_value: trigger.triggerValue,
          effect_type: trigger.effectType,
          effect_config: trigger.effectConfig,
        })),
      );
    }
  });
}

export async function softDelete(id: number, clearReferences: boolean): Promise<boolean> {
  return db.transaction(async (trx) => {
    if (clearReferences) {
      await trx('map_cells').where({ card_id: id }).del();
    }
    const affected = await trx('cards')
      .where({ id })
      .update({ is_active: false, updated_at: trx.fn.now() });
    return affected > 0;
  });
}

export async function isReferenced(id: number): Promise<boolean> {
  const row = await db('map_cells').where({ card_id: id }).count('id as count').first();
  return Number((row as CountRow)?.count ?? 0) > 0;
}

export async function getUsages(cardId: number): Promise<CardUsage[]> {
  const rows = (await db('map_cells as c')
    .join('map_projects as p', 'p.id', 'c.project_id')
    .where('c.card_id', cardId)
    .orderBy('p.id')
    .orderBy('c.y')
    .orderBy('c.x')
    .select('p.id as project_id', 'p.name as project_name', 'c.x', 'c.y')) as Array<{
    project_id: number | string;
    project_name: string;
    x: number;
    y: number;
  }>;

  const byProject = new Map<number, CardUsage>();
  for (const row of rows) {
    const projectId = Number(row.project_id);
    let usage = byProject.get(projectId);
    if (!usage) {
      usage = { projectId, projectName: row.project_name, cells: [] };
      byProject.set(projectId, usage);
    }
    usage.cells.push({ x: row.x, y: row.y });
  }
  return [...byProject.values()];
}
