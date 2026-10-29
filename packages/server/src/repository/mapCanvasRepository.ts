import { randomUUID } from 'node:crypto';
import { GRID_SIZE_DEFAULT, MAP_JSON_VERSION } from '@loredoku/shared';
import { db } from '../db/knex';
import type { DraftRegion, MapDraft, MapRow, MapStyle, ResizeRemoved } from '@loredoku/shared';
import { absorbLegacyMapDraft } from '../service/mapDraftCompat';
import { THEME_CODE, type MapRowWithLineage } from './mapRepository';

export interface DraftRecord {
  /**
   * `null` = 这张地图还没初始化：创建地图时不写草稿，第一次进编辑器时
   * 才由初始化弹窗（填尺寸 / 导入）写入。
   */
  draft: MapDraft | null;
}

export interface ResizeOutcome {
  record: DraftRecord;
  removed: ResizeRemoved;
}

export function emptyDraft(gridSize: number): MapDraft {
  return {
    version: MAP_JSON_VERSION,
    gridSize,
    cells: {},
    regions: [],
  };
}

/**
 * stored drafts may still be the v2 shape (roster + palette). They are
 * absorbed on every read rather than migrated in the database, so the
 * migration stays reversible and no bytes are rewritten.
 *
 * `data` 为 `null` 就是「未初始化」，这个状态要一路透到前端让编辑器弹初始化
 * 弹窗，所以这里不用 `emptyDraft()` 兜底（兜底会把未初始化伪装成「已有一个
 * 默认画布」）。
 */
function parseDraft(mapRow: MapRow): DraftRecord {
  const draft = absorbLegacyMapDraft(mapRow.data) as MapDraft | null;
  return { draft };
}

/**
 * v0.8.0 §19：带上主题编码。这一行要变成接口里的 `MapEntry`，而 `MapEntry` 用编码
 * 说主题 —— 在主键上做一次标量子查询，比让每个调用方各自再查一次便宜。
 */
export async function getMapRow(mapId: number): Promise<MapRowWithLineage | undefined> {
  return db('maps as m')
    .select('m.*', THEME_CODE)
    .where('m.id', mapId)
    .first() as Promise<MapRowWithLineage | undefined>;
}

export async function getDraft(mapId: number): Promise<DraftRecord | undefined> {
  const row = await getMapRow(mapId);
  return row ? parseDraft(row) : undefined;
}

/**
 * **后写覆盖**（不做锁）：两个会话同时编辑同一张图时，最后一次保存胜出。
 * 用户刚点的这次保存一定落地，丢的是对方那份。
 *
 * - `undefined`   -> map not found
 * - `DraftRecord` -> saved
 */
export async function saveDraft(
  mapId: number,
  draft: MapDraft,
): Promise<DraftRecord | undefined> {
  const [updated] = (await db('maps')
    .where({ id: mapId })
    .update({ data: draft, updated_at: db.fn.now() })
    .returning('*')) as MapRow[];
  return updated ? parseDraft(updated) : undefined;
}

export async function resizeDraft(
  mapId: number,
  gridSize: number,
  /**
   * v0.8.0（docs/v0.8.0.md §5 的 S3）—— **初始化那一刻**要把主题的缺省风格
   * 深拷贝进草稿。放在这里而不是 `POST /maps`：v0.5.8 起创建地图不带尺寸、
   * `data` 是 `null`，写草稿要等到第一次定尺寸（或首次导入）。
   *
   * 只在 `row.data === null`（真正未初始化）时生效 —— 已有草稿的地图不追溯，
   * 那正是 S3 与「引用式」的分界。
   */
  options?: { initialStyle?: MapStyle },
): Promise<ResizeOutcome | undefined> {
  return db.transaction(async (trx) => {
    const row = (await trx('maps').where({ id: mapId }).forUpdate().first()) as
      | MapRow
      | undefined;
    if (!row) return undefined;

    const uninitialized = row.data === null || row.data === undefined;
    const draft = (row.data as MapDraft | null) ?? emptyDraft(GRID_SIZE_DEFAULT);
    const removed: ResizeRemoved = {
      background: 0,
      item: 0,
      regions: 0,
      charactersReturnedToSlot: 0,
    };
    const inBounds = (x: number, y: number): boolean =>
      x >= 0 && y >= 0 && x < gridSize && y < gridSize;

    const nextCells: MapDraft['cells'] = {};
    for (const key of Object.keys(draft.cells)) {
      const cell = draft.cells[key];
      if (!cell) continue;
      const [x, y] = key.split(',').map(Number) as [number, number];
      if (inBounds(x, y)) {
        nextCells[key] = cell;
        continue;
      }
      if (cell.background) removed.background += 1;
      if (cell.item) removed.item += 1;
    }

    const nextRegions: DraftRegion[] = [];
    for (const region of draft.regions) {
      const keptCells = region.cells.filter(([x, y]) => inBounds(x, y));
      if (region.cells.length > 0 && keptCells.length === 0) {
        removed.regions += 1;
        continue;
      }
      const label = region.labelCell;
      nextRegions.push({
        ...region,
        cells: keptCells,
        labelCell: label && inBounds(label[0], label[1]) ? label : (keptCells[0] ?? null),
      });
    }

    // 初始化时用主题的缺省风格，否则原样保留草稿自己的那份。
    const style = (uninitialized ? options?.initialStyle : undefined) ?? draft.style;

    const next: MapDraft = {
      version: draft.version ?? MAP_JSON_VERSION,
      gridSize,
      cells: nextCells,
      regions: nextRegions,
      // v0.3.8 FEAT-D02: resizing must not drop the map-level style block.
      ...(style ? { style } : {}),
    };

    const [updated] = (await trx('maps')
      .where({ id: mapId })
      .update({
        data: next,
        updated_at: trx.fn.now(),
      })
      .returning('*')) as MapRow[];

    return { record: parseDraft(updated!), removed };
  });
}

// ---- Region operations (regions live inside the draft JSON) ----

export async function listRegions(mapId: number): Promise<DraftRegion[]> {
  const record = await getDraft(mapId);
  return record?.draft?.regions ?? [];
}

export async function findRegion(
  mapId: number,
  regionId: string,
): Promise<DraftRegion | undefined> {
  const record = await getDraft(mapId);
  return record?.draft?.regions.find((region) => region.id === regionId);
}

export async function createRegion(
  mapId: number,
  region: Omit<DraftRegion, 'id'> & { id?: string },
): Promise<DraftRegion | undefined> {
  return db.transaction(async (trx) => {
    const row = (await trx('maps').where({ id: mapId }).forUpdate().first()) as
      | MapRow
      | undefined;
    if (!row) return undefined;
    const draft = (row.data as MapDraft | null) ?? emptyDraft(GRID_SIZE_DEFAULT);
    const created: DraftRegion = { ...region, id: region.id ?? `rg_${randomUUID().slice(0, 8)}` };
    draft.regions.push(created);
    await trx('maps').where({ id: mapId }).update({
      data: draft,
      updated_at: trx.fn.now(),
    });
    return created;
  });
}

export async function updateRegion(
  mapId: number,
  regionId: string,
  patch: Partial<Omit<DraftRegion, 'id'>>,
): Promise<DraftRegion | undefined> {
  return db.transaction(async (trx) => {
    const row = (await trx('maps').where({ id: mapId }).forUpdate().first()) as
      | MapRow
      | undefined;
    if (!row) return undefined;
    const draft = (row.data as MapDraft | null) ?? emptyDraft(GRID_SIZE_DEFAULT);
    const region = draft.regions.find((item) => item.id === regionId);
    if (!region) return undefined;
    Object.assign(region, patch);
    await trx('maps').where({ id: mapId }).update({
      data: draft,
      updated_at: trx.fn.now(),
    });
    return region;
  });
}

export async function deleteRegion(mapId: number, regionId: string): Promise<boolean> {
  return db.transaction(async (trx) => {
    const row = (await trx('maps').where({ id: mapId }).first()) as
      | MapRow
      | undefined;
    if (!row) return false;
    const draft = (row.data as MapDraft | null) ?? emptyDraft(GRID_SIZE_DEFAULT);
    const before = draft.regions.length;
    draft.regions = draft.regions.filter((region) => region.id !== regionId);
    if (draft.regions.length === before) return false;
    await trx('maps').where({ id: mapId }).update({
      data: draft,
      updated_at: trx.fn.now(),
    });
    return true;
  });
}

export async function overwriteDraft(
  mapId: number,
  draft: MapDraft,
): Promise<DraftRecord | undefined> {
  return db.transaction(async (trx) => {
    const row = (await trx('maps').where({ id: mapId }).first()) as
      | MapRow
      | undefined;
    if (!row) return undefined;
    const [updated] = (await trx('maps')
      .where({ id: mapId })
      .update({
        data: draft,
        updated_at: trx.fn.now(),
      })
      .returning('*')) as MapRow[];
    return parseDraft(updated!);
  });
}
