import { ErrorCode, GRID_SIZE_DEFAULT } from '@loredoku/shared';
import type {
  DraftRegion,
  MapDraft,
  MapResponse,
  MapRow,
  ResizeResult,
  SaveMapDraftInput,
} from '@loredoku/shared';
import * as mapRepo from '../repository/mapRepository';
import * as mapCanvasRepo from '../repository/mapCanvasRepository';
import { toMapEntry } from '../repository/mapRepository';
import * as assetRepo from '../repository/assetRepository';
import { AppError } from '../utils/AppError';

/**
 * 合并后版本行也是合法的 `maps` 行，`/api/maps/:id`
 * 的每个写入口都能直达它 —— 合并前它在另一张表，天然免疫。画布 / 尺寸 / 区域
 * 一律只允许写草稿行。
 */
function assertWritable(row: MapRow | undefined): MapRow {
  if (!row) {
    throw AppError.notFound('地图不存在');
  }
  if (row.version !== 'draft') {
    throw AppError.validation('已发布的版本不可修改');
  }
  return row;
}

async function assertValidReferences(draft: MapDraft, size: number): Promise<void> {
  for (const key of Object.keys(draft.cells)) {
    const [x, y] = key.split(',').map(Number) as [number, number];
    if (x < 0 || y < 0 || x >= size || y >= size) {
      throw AppError.validation(`单元格 (${x}, ${y}) 超出边界`);
    }
  }

  for (const region of draft.regions) {
    for (const [x, y] of region.cells) {
      if (x < 0 || y < 0 || x >= size || y >= size) {
        throw AppError.validation(`区域「${region.name}」的单元格 (${x}, ${y}) 超出边界`);
      }
    }
  }

  const assetIds = new Set<number>();
  for (const key of Object.keys(draft.cells)) {
    const cell = draft.cells[key];
    if (!cell) continue;
    if (cell.item) assetIds.add(cell.item.assetId);
    if (cell.background) assetIds.add(cell.background.assetId);
  }
  const existingAssets = await assetRepo.existingAssetIds([...assetIds]);
  const missingAssets = [...assetIds].filter((id) => !existingAssets.has(id));
  if (missingAssets.length > 0) {
    throw AppError.validation('存在无效的资源引用', missingAssets);
  }
  // the roster left the map (it belongs to the puzzle), so there is
  // nothing character-shaped to validate here any more.
}

function assertNoRegionOverlap(regions: DraftRegion[]): void {
  const owner = new Map<string, string>();
  for (const region of regions) {
    for (const [x, y] of region.cells) {
      const key = `${x},${y}`;
      const previous = owner.get(key);
      if (previous) {
        throw new AppError(
          ErrorCode.REGION_OVERLAP,
          `单元格 (${x}, ${y}) 同时属于「${previous}」与「${region.name}」`,
        );
      }
      owner.set(key, region.name);
    }
  }
}

export async function getMap(mapId: number): Promise<MapResponse> {
  const row = await mapCanvasRepo.getMapRow(mapId);
  if (!row) {
    throw AppError.notFound('地图不存在');
  }
  const record = await mapCanvasRepo.getDraft(mapId);
  if (!record) {
    throw AppError.notFound('地图不存在');
  }
  return { map: toMapEntry(row), draft: record.draft };
}

export async function saveMap(mapId: number, input: SaveMapDraftInput): Promise<MapResponse> {
  assertWritable(await mapCanvasRepo.getMapRow(mapId));

  // 尺寸只认草稿自己带的那一份（DB 没有尺寸列），越界由
  // assertValidReferences 按同一个值检查。
  const draft: MapDraft = { ...input.data };
  await assertValidReferences(draft, draft.gridSize);
  assertNoRegionOverlap(draft.regions);

  // 后写覆盖：不做并发比对。
  const saved = await mapCanvasRepo.saveDraft(mapId, draft);
  if (!saved) {
    throw AppError.notFound('地图不存在');
  }
  const fresh = await mapCanvasRepo.getMapRow(mapId);
  if (!fresh) {
    throw AppError.notFound('地图不存在');
  }
  return { map: toMapEntry(fresh), draft: saved.draft };
}

export async function updateGridSize(mapId: number, gridSize: number): Promise<ResizeResult> {
  assertWritable(await mapCanvasRepo.getMapRow(mapId));
  const outcome = await mapCanvasRepo.resizeDraft(mapId, gridSize);
  if (!outcome || outcome.record.draft === null) {
    throw AppError.notFound('地图不存在');
  }
  // resizeDraft 一定会写回一个带 gridSize 的草稿，所以这里非空。
  return { gridSize: outcome.record.draft.gridSize, removed: outcome.removed };
}

export async function exportMap(mapId: number): Promise<MapDraft> {
  const record = await mapCanvasRepo.getDraft(mapId);
  if (!record) {
    throw AppError.notFound('地图不存在');
  }
  // 未初始化的地图导出一份空草稿，比报错更符合「导出」的语义。
  return record.draft ?? mapCanvasRepo.emptyDraft(GRID_SIZE_DEFAULT);
}

export async function importMap(mapId: number, data: MapDraft): Promise<MapResponse> {
  const row = assertWritable(await mapCanvasRepo.getMapRow(mapId));
  await assertValidReferences(data, data.gridSize);
  assertNoRegionOverlap(data.regions);
  const saved = await mapCanvasRepo.overwriteDraft(mapId, data);
  if (!saved) {
    throw AppError.notFound('地图不存在');
  }
  return { map: toMapEntry(row), draft: saved.draft };
}

export async function listRegions(mapId: number): Promise<DraftRegion[]> {
  const row = await mapCanvasRepo.getMapRow(mapId);
  if (!row) {
    throw AppError.notFound('地图不存在');
  }
  return mapCanvasRepo.listRegions(mapId);
}
export async function createRegion(
  mapId: number,
  input: Omit<DraftRegion, 'id'> & { id?: string },
): Promise<DraftRegion> {
  assertWritable(await mapCanvasRepo.getMapRow(mapId));
  const record = await mapCanvasRepo.getDraft(mapId);
  if (!record) {
    throw AppError.notFound('地图不存在');
  }
  const size = record.draft?.gridSize ?? GRID_SIZE_DEFAULT;
  for (const [x, y] of input.cells) {
    if (x < 0 || y < 0 || x >= size || y >= size) {
      throw AppError.validation(`区域单元格 (${x}, ${y}) 超出边界`);
    }
  }
  const existing = await mapCanvasRepo.listRegions(mapId);
  assertNoRegionOverlap([...existing, { ...input, id: input.id ?? '__new__' }]);
  const created = await mapCanvasRepo.createRegion(mapId, input);
  if (!created) {
    throw AppError.notFound('地图不存在');
  }
  return created;
}

export async function updateRegion(
  mapId: number,
  regionId: string,
  patch: Partial<Omit<DraftRegion, 'id'>>,
): Promise<DraftRegion> {
  assertWritable(await mapCanvasRepo.getMapRow(mapId));
  const record = await mapCanvasRepo.getDraft(mapId);
  if (!record) {
    throw AppError.notFound('地图不存在');
  }
  const size = record.draft?.gridSize ?? GRID_SIZE_DEFAULT;
  const region = await mapCanvasRepo.findRegion(mapId, regionId);
  if (!region) {
    throw AppError.notFound('区域不存在');
  }
  if (patch.cells) {
    for (const [x, y] of patch.cells) {
      if (x < 0 || y < 0 || x >= size || y >= size) {
        throw AppError.validation(`区域单元格 (${x}, ${y}) 超出边界`);
      }
    }
    const others = (await mapCanvasRepo.listRegions(mapId)).filter((item) => item.id !== regionId);
    assertNoRegionOverlap([...others, { ...region, ...patch, id: regionId }]);
  }
  const updated = await mapCanvasRepo.updateRegion(mapId, regionId, patch);
  if (!updated) {
    throw AppError.notFound('区域不存在');
  }
  return updated;
}

export async function deleteRegion(mapId: number, regionId: string): Promise<void> {
  assertWritable(await mapCanvasRepo.getMapRow(mapId));
  const removed = await mapCanvasRepo.deleteRegion(mapId, regionId);
  if (!removed) {
    throw AppError.notFound('区域不存在');
  }
}
