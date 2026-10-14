import { ErrorCode } from '@murdoku/shared';
import type {
  DraftRegion,
  MapDraft,
  MapVersionDetail,
  MapVersionSummary,
  PublishViolation,
} from '@murdoku/shared';
import * as mapRepo from '../repository/mapRepository';
import * as versionRepo from '../repository/versionRepository';
import * as itemRepo from '../repository/itemRepository';
import * as characterRepo from '../repository/characterRepository';
import { AppError } from '../utils/AppError';

function parseCellKey(key: string): [number, number] {
  const [x, y] = key.split(',').map(Number) as [number, number];
  return [x, y];
}

function collectCoords(draft: MapDraft): Array<[number, number, string]> {
  const coords: Array<[number, number, string]> = [];
  for (const key of Object.keys(draft.cells)) {
    const [x, y] = parseCellKey(key);
    coords.push([x, y, `单元格 (${x}, ${y})`]);
  }
  for (const region of draft.regions) {
    for (const [x, y] of region.cells) {
      coords.push([x, y, `区域「${region.name}」的单元格 (${x}, ${y})`]);
    }
  }
  for (const placed of draft.placedCharacters) {
    coords.push([placed.x, placed.y, `角色位置 (${placed.x}, ${placed.y})`]);
  }
  return coords;
}

function isRegionConnected(region: DraftRegion): boolean {
  if (region.cells.length <= 1) return true;
  const set = new Set(region.cells.map(([x, y]) => `${x},${y}`));
  const start = region.cells[0];
  if (!start) return true;
  const seen = new Set<string>([`${start[0]},${start[1]}`]);
  const queue: Array<[number, number]> = [start];
  while (queue.length > 0) {
    const [x, y] = queue.shift()!;
    const neighbours: Array<[number, number]> = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ];
    for (const [nx, ny] of neighbours) {
      const key = `${nx},${ny}`;
      if (set.has(key) && !seen.has(key)) {
        seen.add(key);
        queue.push([nx, ny]);
      }
    }
  }
  return seen.size === set.size;
}

export async function validateDraft(draft: MapDraft): Promise<PublishViolation[]> {
  const violations: PublishViolation[] = [];
  const size = draft.gridSize;

  for (const [x, y, label] of collectCoords(draft)) {
    if (x < 0 || y < 0 || x >= size || y >= size) {
      violations.push({ rule: 'bounds', message: `${label} 超出边界` });
    }
  }

  const itemIds = new Set<number>();
  for (const key of Object.keys(draft.cells)) {
    const cell = draft.cells[key];
    if (!cell) continue;
    if (cell.object) itemIds.add(cell.object.itemId);
    if (cell.background) itemIds.add(cell.background.itemId);
  }

  const meta = await itemRepo.itemMetaByIds([...itemIds]);
  for (const id of itemIds) {
    if (!meta.has(id)) {
      violations.push({ rule: 'item_reference', message: `物品 #${id} 不存在` });
    }
  }
  for (const key of Object.keys(draft.cells)) {
    const cell = draft.cells[key];
    if (!cell?.object) continue;
    const info = meta.get(cell.object.itemId);
    if (info && !info.canStand) {
      violations.push({
        rule: 'object_can_stand',
        message: `物品 #${cell.object.itemId} 不可站立，不能放在物体层`,
      });
    }
  }

  const characterIds = new Set<number>();
  for (const placed of draft.placedCharacters) characterIds.add(placed.characterId);
  for (const slot of draft.characterSlots) {
    if (slot) characterIds.add(slot.characterId);
  }
  const existingCharacters = await characterRepo.existingCharacterIds([...characterIds]);
  for (const id of characterIds) {
    if (!existingCharacters.has(id)) {
      violations.push({ rule: 'character_reference', message: `角色 #${id} 不存在` });
    }
  }

  const owner = new Map<string, string>();
  for (const region of draft.regions) {
    for (const [x, y] of region.cells) {
      const key = `${x},${y}`;
      const previous = owner.get(key);
      if (previous) {
        violations.push({
          rule: 'region_overlap',
          message: `区域「${previous}」与「${region.name}」在 (${x}, ${y}) 重叠`,
        });
      } else {
        owner.set(key, region.name);
      }
    }
  }

  for (const region of draft.regions) {
    if (!isRegionConnected(region)) {
      violations.push({ rule: 'region_connected', message: `区域「${region.name}」不是连通区域` });
    }
  }

  return violations;
}

export async function publishProject(
  projectId: number,
  notes: string | null,
): Promise<MapVersionSummary> {
  const record = await mapRepo.getDraft(projectId);
  if (!record) {
    throw AppError.notFound('项目不存在');
  }

  const violations = await validateDraft(record.draft);
  if (violations.length > 0) {
    throw new AppError(ErrorCode.PUBLISH_VALIDATION_FAILED, '发布校验未通过', violations);
  }

  const versionNo = await versionRepo.nextVersionNo(projectId);
  return versionRepo.createVersion({
    projectId,
    versionNo,
    gridSize: record.draft.gridSize,
    data: record.draft,
    notes: notes ?? null,
  });
}

export async function listVersions(projectId: number): Promise<MapVersionSummary[]> {
  const project = await mapRepo.getProjectRow(projectId);
  if (!project) {
    throw AppError.notFound('项目不存在');
  }
  return versionRepo.listVersions(projectId);
}

export async function getVersion(projectId: number, versionNo: number): Promise<MapVersionDetail> {
  const row = await versionRepo.getVersion(projectId, versionNo);
  if (!row) {
    throw AppError.notFound('版本不存在');
  }
  const itemIds = new Set<number>();
  for (const cell of Object.values(row.data?.cells ?? {})) {
    if (cell?.object) itemIds.add(cell.object.itemId);
    if (cell?.background) itemIds.add(cell.background.itemId);
  }
  return {
    id: Number(row.id),
    versionNo: row.version_no,
    gridSize: row.grid_size,
    notes: row.notes,
    publishedAt: new Date(row.snapshot_created_at).toISOString(),
    data: row.data,
    participantCount: row.data?.placedCharacters?.length ?? 0,
    regionCount: row.data?.regions?.length ?? 0,
    itemCount: itemIds.size,
  };
}

export async function deleteVersion(projectId: number, versionNo: number): Promise<void> {
  const row = await versionRepo.getVersion(projectId, versionNo);
  if (!row) {
    throw AppError.notFound('作品不存在');
  }
  await versionRepo.deleteVersion(projectId, versionNo);
}

export async function createDraftFromVersion(
  projectId: number,
  versionNo: number,
): Promise<{ draft: MapDraft; updatedAt: string | null }> {
  const row = await versionRepo.getVersion(projectId, versionNo);
  if (!row) {
    throw AppError.notFound('版本不存在');
  }
  const saved = await mapRepo.overwriteDraft(projectId, row.data);
  if (!saved) {
    throw AppError.notFound('项目不存在');
  }
  return saved;
}
