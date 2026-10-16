import { ErrorCode } from '@loredoku/shared';
import type {
  DraftRegion,
  MapDraft,
  MapResponse,
  ResizeResult,
  SaveMapDraftInput,
} from '@loredoku/shared';
import * as mapRepo from '../repository/mapRepository';
import { toProject } from '../repository/projectRepository';
import * as itemRepo from '../repository/itemRepository';
import * as characterRepo from '../repository/characterRepository';
import { AppError } from '../utils/AppError';

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

  const itemIds = new Set<number>();
  for (const key of Object.keys(draft.cells)) {
    const cell = draft.cells[key];
    if (!cell) continue;
    if (cell.object) itemIds.add(cell.object.itemId);
    if (cell.background) itemIds.add(cell.background.itemId);
  }
  const existingItems = await itemRepo.existingItemIds([...itemIds]);
  const missingItems = [...itemIds].filter((id) => !existingItems.has(id));
  if (missingItems.length > 0) {
    throw AppError.validation('存在无效的物品引用', missingItems);
  }

  // CLAR-603: participants live in the roster; no placedCharacters check.
  const characterIds = new Set<number>();
  for (const slot of draft.characterSlots) {
    if (slot) characterIds.add(slot.characterId);
  }
  const existingCharacters = await characterRepo.existingCharacterIds([...characterIds]);
  const missingCharacters = [...characterIds].filter((id) => !existingCharacters.has(id));
  if (missingCharacters.length > 0) {
    throw AppError.validation('存在无效的角色引用', missingCharacters);
  }
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

export async function getMap(projectId: number): Promise<MapResponse> {
  const row = await mapRepo.getProjectRow(projectId);
  if (!row) {
    throw AppError.notFound('地图不存在');
  }
  const record = await mapRepo.getDraft(projectId);
  if (!record) {
    throw AppError.notFound('地图不存在');
  }
  return { project: toProject(row), draft: record.draft, updatedAt: record.updatedAt };
}

export async function saveMap(projectId: number, input: SaveMapDraftInput): Promise<MapResponse> {
  const row = await mapRepo.getProjectRow(projectId);
  if (!row) {
    throw AppError.notFound('地图不存在');
  }

  const draft: MapDraft = { ...input.data, gridSize: row.grid_size };
  await assertValidReferences(draft, row.grid_size);
  assertNoRegionOverlap(draft.regions);

  const saved = await mapRepo.saveDraft(projectId, input.updatedAt ?? null, draft);
  if (saved === undefined) {
    throw AppError.notFound('地图不存在');
  }
  if (saved === null) {
    throw new AppError(ErrorCode.DRAFT_CONFLICT, '草稿已被其他会话修改，请刷新后重试');
  }
  const fresh = await mapRepo.getProjectRow(projectId);
  return { project: toProject(fresh ?? row), draft: saved.draft, updatedAt: saved.updatedAt };
}

export async function updateGridSize(projectId: number, gridSize: number): Promise<ResizeResult> {
  const outcome = await mapRepo.resizeDraft(projectId, gridSize);
  if (!outcome) {
    throw AppError.notFound('地图不存在');
  }
  return { gridSize: outcome.record.draft.gridSize, removed: outcome.removed };
}

export async function exportMap(projectId: number): Promise<MapDraft> {
  const record = await mapRepo.getDraft(projectId);
  if (!record) {
    throw AppError.notFound('地图不存在');
  }
  return record.draft;
}

export async function importMap(projectId: number, data: MapDraft): Promise<MapResponse> {
  const row = await mapRepo.getProjectRow(projectId);
  if (!row) {
    throw AppError.notFound('地图不存在');
  }
  await assertValidReferences(data, data.gridSize);
  assertNoRegionOverlap(data.regions);
  const saved = await mapRepo.overwriteDraft(projectId, data);
  if (!saved) {
    throw AppError.notFound('地图不存在');
  }
  return { project: toProject(row), draft: saved.draft, updatedAt: saved.updatedAt };
}

export async function listRegions(projectId: number): Promise<DraftRegion[]> {
  const row = await mapRepo.getProjectRow(projectId);
  if (!row) {
    throw AppError.notFound('地图不存在');
  }
  return mapRepo.listRegions(projectId);
}

export async function createRegion(
  projectId: number,
  input: Omit<DraftRegion, 'id'> & { id?: string },
): Promise<DraftRegion> {
  const row = await mapRepo.getProjectRow(projectId);
  if (!row) {
    throw AppError.notFound('地图不存在');
  }
  for (const [x, y] of input.cells) {
    if (x < 0 || y < 0 || x >= row.grid_size || y >= row.grid_size) {
      throw AppError.validation(`区域单元格 (${x}, ${y}) 超出边界`);
    }
  }
  const existing = await mapRepo.listRegions(projectId);
  assertNoRegionOverlap([...existing, { ...input, id: input.id ?? '__new__' }]);
  const created = await mapRepo.createRegion(projectId, input);
  if (!created) {
    throw AppError.notFound('地图不存在');
  }
  return created;
}

export async function updateRegion(
  projectId: number,
  regionId: string,
  patch: Partial<Omit<DraftRegion, 'id'>>,
): Promise<DraftRegion> {
  const row = await mapRepo.getProjectRow(projectId);
  if (!row) {
    throw AppError.notFound('地图不存在');
  }
  const region = await mapRepo.findRegion(projectId, regionId);
  if (!region) {
    throw AppError.notFound('区域不存在');
  }
  if (patch.cells) {
    for (const [x, y] of patch.cells) {
      if (x < 0 || y < 0 || x >= row.grid_size || y >= row.grid_size) {
        throw AppError.validation(`区域单元格 (${x}, ${y}) 超出边界`);
      }
    }
    const others = (await mapRepo.listRegions(projectId)).filter((item) => item.id !== regionId);
    assertNoRegionOverlap([...others, { ...region, ...patch, id: regionId }]);
  }
  const updated = await mapRepo.updateRegion(projectId, regionId, patch);
  if (!updated) {
    throw AppError.notFound('区域不存在');
  }
  return updated;
}

export async function deleteRegion(projectId: number, regionId: string): Promise<void> {
  const removed = await mapRepo.deleteRegion(projectId, regionId);
  if (!removed) {
    throw AppError.notFound('区域不存在');
  }
}
