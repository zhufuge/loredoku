import type { CellCoord, MapData, RegionData, RegionInput, SaveMapInput } from '@murdoku/shared';
import * as mapRepo from '../repository/mapRepository';
import * as projectRepo from '../repository/projectRepository';
import { AppError } from '../utils/AppError';

function assertCoordsInBounds(cells: CellCoord[], size: number, label: string): void {
  for (const cell of cells) {
    if (cell.x < 0 || cell.y < 0 || cell.x >= size || cell.y >= size) {
      throw AppError.validation(`${label} 坐标超出画布范围`, [{ x: cell.x, y: cell.y }]);
    }
  }
}

function assertNoDuplicateCells(cells: Array<{ x: number; y: number }>): void {
  const seen = new Set<string>();
  for (const cell of cells) {
    const key = `${cell.x},${cell.y}`;
    if (seen.has(key)) {
      throw AppError.validation('存在重复的单元格坐标', [{ x: cell.x, y: cell.y }]);
    }
    seen.add(key);
  }
}

function assertRegionExclusivity(regions: Array<{ name: string; cells: CellCoord[] }>): void {
  const owners = new Map<string, string>();
  for (const region of regions) {
    for (const cell of region.cells) {
      const key = `${cell.x},${cell.y}`;
      const owner = owners.get(key);
      if (owner !== undefined) {
        throw AppError.conflict(`单元格 (${cell.x}, ${cell.y}) 同时属于「${owner}」和「${region.name}」`);
      }
      owners.set(key, region.name);
    }
  }
}

export async function getMap(projectId: number): Promise<MapData> {
  const project = await projectRepo.findById(projectId);
  if (!project) {
    throw AppError.notFound('项目不存在');
  }
  const data = await mapRepo.getMapData(projectId);
  return { project: projectRepo.toProject(project), ...data };
}

export async function saveMap(projectId: number, input: SaveMapInput): Promise<MapData> {
  const project = await projectRepo.findById(projectId);
  if (!project) {
    throw AppError.notFound('项目不存在');
  }

  if (input.updatedAt && new Date(project.updated_at).toISOString() !== input.updatedAt) {
    throw AppError.conflict('数据已被他人修改，请刷新后重试');
  }

  assertCoordsInBounds(
    input.cells.map((cell) => ({ x: cell.x, y: cell.y })),
    project.grid_size,
    '卡片',
  );
  assertNoDuplicateCells(input.cells);

  for (const region of input.regions) {
    assertCoordsInBounds(region.cells, project.grid_size, `区域「${region.name}」`);
    assertNoDuplicateCells(region.cells);
  }
  assertRegionExclusivity(input.regions);

  const cardIds = [...new Set(input.cells.map((cell) => cell.cardId))];
  const existing = await mapRepo.existingCardIds(cardIds);
  const missing = cardIds.filter((cardId) => !existing.has(cardId));
  if (missing.length > 0) {
    throw AppError.validation('存在无效的卡片引用', missing);
  }

  const data = await mapRepo.replaceMap(projectId, input);
  const fresh = await projectRepo.findById(projectId);
  return { project: projectRepo.toProject(fresh ?? project), ...data };
}

export async function listRegions(projectId: number): Promise<RegionData[]> {
  const project = await projectRepo.findById(projectId);
  if (!project) {
    throw AppError.notFound('项目不存在');
  }
  return mapRepo.listRegions(projectId);
}

export async function createRegion(projectId: number, input: RegionInput): Promise<RegionData> {
  const project = await projectRepo.findById(projectId);
  if (!project) {
    throw AppError.notFound('项目不存在');
  }
  assertCoordsInBounds(input.cells, project.grid_size, `区域「${input.name}」`);
  assertNoDuplicateCells(input.cells);

  const owners = await mapRepo.regionCellOwners(projectId);
  const conflict = input.cells.find((cell) => owners.has(`${cell.x},${cell.y}`));
  if (conflict) {
    throw AppError.conflict(`单元格 (${conflict.x}, ${conflict.y}) 已被其它区域占用`);
  }

  return mapRepo.createRegion(projectId, input);
}

export async function updateRegion(
  regionId: number,
  patch: mapRepo.RegionPatch,
): Promise<RegionData> {
  const region = await mapRepo.findRegion(regionId);
  if (!region) {
    throw AppError.notFound('区域不存在');
  }
  const project = await projectRepo.findById(Number(region.project_id));
  if (!project) {
    throw AppError.notFound('项目不存在');
  }

  if (patch.cells) {
    assertCoordsInBounds(patch.cells, project.grid_size, `区域「${region.name}」`);
    assertNoDuplicateCells(patch.cells);
    const owners = await mapRepo.regionCellOwners(Number(region.project_id), regionId);
    const conflict = patch.cells.find((cell) => owners.has(`${cell.x},${cell.y}`));
    if (conflict) {
      throw AppError.conflict(`单元格 (${conflict.x}, ${conflict.y}) 已被其它区域占用`);
    }
  }

  const updated = await mapRepo.updateRegion(regionId, patch);
  if (!updated) {
    throw AppError.notFound('区域不存在');
  }
  return updated;
}

export async function deleteRegion(regionId: number): Promise<void> {
  const region = await mapRepo.findRegion(regionId);
  if (!region) {
    throw AppError.notFound('区域不存在');
  }
  await mapRepo.deleteRegion(regionId);
}
