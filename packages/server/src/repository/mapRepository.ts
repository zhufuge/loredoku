import { randomUUID } from 'node:crypto';
import { GRID_SIZE_DEFAULT, MAP_JSON_VERSION } from '@loredoku/shared';
import { db } from '../db/knex';
import type { DraftRegion, MapDraft, ProjectRow, ResizeRemoved } from '@loredoku/shared';
import { absorbLegacyMapDraft } from '../service/mapDraftCompat';

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
function parseDraft(project: ProjectRow): DraftRecord {
  const draft = absorbLegacyMapDraft(project.data) as MapDraft | null;
  return { draft };
}

export async function getProjectRow(projectId: number): Promise<ProjectRow | undefined> {
  return db<ProjectRow>('maps').where({ id: projectId }).first();
}

export async function getDraft(projectId: number): Promise<DraftRecord | undefined> {
  const row = await getProjectRow(projectId);
  return row ? parseDraft(row) : undefined;
}

/**
 * **后写覆盖**（不做锁）：两个会话同时编辑同一张图时，最后一次保存胜出。
 * 用户刚点的这次保存一定落地，丢的是对方那份。
 *
 * - `undefined`   -> project not found
 * - `DraftRecord` -> saved
 */
export async function saveDraft(
  projectId: number,
  draft: MapDraft,
): Promise<DraftRecord | undefined> {
  const [updated] = (await db('maps')
    .where({ id: projectId })
    .update({ data: draft, updated_at: db.fn.now() })
    .returning('*')) as ProjectRow[];
  return updated ? parseDraft(updated) : undefined;
}

export async function resizeDraft(
  projectId: number,
  gridSize: number,
): Promise<ResizeOutcome | undefined> {
  return db.transaction(async (trx) => {
    const row = (await trx('maps').where({ id: projectId }).forUpdate().first()) as
      | ProjectRow
      | undefined;
    if (!row) return undefined;

    const draft = (row.data as MapDraft | null) ?? emptyDraft(GRID_SIZE_DEFAULT);
    const removed: ResizeRemoved = {
      background: 0,
      object: 0,
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
      if (cell.object) removed.object += 1;
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

    const next: MapDraft = {
      version: draft.version ?? MAP_JSON_VERSION,
      gridSize,
      cells: nextCells,
      regions: nextRegions,
      // v0.3.8 FEAT-D02: resizing must not drop the map-level style block.
      ...(draft.style ? { style: draft.style } : {}),
    };

    const [updated] = (await trx('maps')
      .where({ id: projectId })
      .update({
        data: next,
        updated_at: trx.fn.now(),
      })
      .returning('*')) as ProjectRow[];

    return { record: parseDraft(updated!), removed };
  });
}

// ---- Region operations (regions live inside the draft JSON) ----

export async function listRegions(projectId: number): Promise<DraftRegion[]> {
  const record = await getDraft(projectId);
  return record?.draft?.regions ?? [];
}

export async function findRegion(
  projectId: number,
  regionId: string,
): Promise<DraftRegion | undefined> {
  const record = await getDraft(projectId);
  return record?.draft?.regions.find((region) => region.id === regionId);
}

export async function createRegion(
  projectId: number,
  region: Omit<DraftRegion, 'id'> & { id?: string },
): Promise<DraftRegion | undefined> {
  return db.transaction(async (trx) => {
    const row = (await trx('maps').where({ id: projectId }).forUpdate().first()) as
      | ProjectRow
      | undefined;
    if (!row) return undefined;
    const draft = (row.data as MapDraft | null) ?? emptyDraft(GRID_SIZE_DEFAULT);
    const created: DraftRegion = { ...region, id: region.id ?? `rg_${randomUUID().slice(0, 8)}` };
    draft.regions.push(created);
    await trx('maps').where({ id: projectId }).update({
      data: draft,
      updated_at: trx.fn.now(),
    });
    return created;
  });
}

export async function updateRegion(
  projectId: number,
  regionId: string,
  patch: Partial<Omit<DraftRegion, 'id'>>,
): Promise<DraftRegion | undefined> {
  return db.transaction(async (trx) => {
    const row = (await trx('maps').where({ id: projectId }).forUpdate().first()) as
      | ProjectRow
      | undefined;
    if (!row) return undefined;
    const draft = (row.data as MapDraft | null) ?? emptyDraft(GRID_SIZE_DEFAULT);
    const region = draft.regions.find((item) => item.id === regionId);
    if (!region) return undefined;
    Object.assign(region, patch);
    await trx('maps').where({ id: projectId }).update({
      data: draft,
      updated_at: trx.fn.now(),
    });
    return region;
  });
}

export async function deleteRegion(projectId: number, regionId: string): Promise<boolean> {
  return db.transaction(async (trx) => {
    const row = (await trx('maps').where({ id: projectId }).first()) as
      | ProjectRow
      | undefined;
    if (!row) return false;
    const draft = (row.data as MapDraft | null) ?? emptyDraft(GRID_SIZE_DEFAULT);
    const before = draft.regions.length;
    draft.regions = draft.regions.filter((region) => region.id !== regionId);
    if (draft.regions.length === before) return false;
    await trx('maps').where({ id: projectId }).update({
      data: draft,
      updated_at: trx.fn.now(),
    });
    return true;
  });
}

export async function overwriteDraft(
  projectId: number,
  draft: MapDraft,
): Promise<DraftRecord | undefined> {
  return db.transaction(async (trx) => {
    const row = (await trx('maps').where({ id: projectId }).first()) as
      | ProjectRow
      | undefined;
    if (!row) return undefined;
    const [updated] = (await trx('maps')
      .where({ id: projectId })
      .update({
        data: draft,
        updated_at: trx.fn.now(),
      })
      .returning('*')) as ProjectRow[];
    return parseDraft(updated!);
  });
}
