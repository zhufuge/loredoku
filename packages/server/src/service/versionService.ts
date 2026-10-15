import { ErrorCode } from '@murdoku/shared';
import type {
  DraftRegion,
  MapDraft,
  MapVersionDetail,
  MapVersionSummary,
  PublishViolation,
  WorkSummary,
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

/**
 * CLAR-603 (docs/v0.3.1.md §3.3) — the sudoku-style P1~P6 rules from v0.3.0
 * are gone. The new publish rules are:
 *   P1 — at least one usable participant (a slot whose character exists and
 *        has an avatar)
 *   P2 — participants without an avatar are treated as not enabled and are
 *        not counted (see P1)
 *   P3 — no overlapping region cells
 *   P4 — multi-cell items fully inside the board (OPT-904 removed the
 *        "non-standable items cannot sit on the object layer" rule)
 *   P5 — every trigger target reference exists
 */
export async function validateDraft(draft: MapDraft): Promise<PublishViolation[]> {
  const violations: PublishViolation[] = [];
  const size = draft.gridSize;

  // ---- Bounds check for cells / regions ----
  for (const [x, y, label] of collectCoords(draft)) {
    if (x < 0 || y < 0 || x >= size || y >= size) {
      violations.push({ rule: 'bounds', message: `${label} 超出边界` });
    }
  }

  // ---- P1 / P2 — at least one usable participant ----
  // P2 (docs/v0.3.1.md §3.3): a participant whose character has no avatar is
  // treated as not enabled and is not counted towards the P1 minimum.
  const slotCharacterIds = new Set<number>();
  for (const slot of draft.characterSlots) {
    if (slot) slotCharacterIds.add(slot.characterId);
  }
  const characterMeta = await characterRepo.characterSlotMetaByIds([...slotCharacterIds]);
  for (const id of slotCharacterIds) {
    if (!characterMeta.has(id)) {
      violations.push({ rule: 'character_reference', message: `角色 #${id} 不存在` });
    }
  }
  const usableParticipants = draft.characterSlots.filter(
    (slot) => slot !== null && characterMeta.get(slot.characterId)?.hasAvatar === true,
  );
  if (usableParticipants.length === 0) {
    violations.push({ rule: 'participant_required', message: '至少需要 1 名参与者' });
  }

  // ---- Item references + multi-cell coverage (P4) ----
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
    // OPT-904 (docs/v0.3.4.md §4.1): a non-standable item IS allowed on the
    // object layer — the v0.3.1 `object_can_stand` rule is gone. Only the
    // background layer is restricted, and that is enforced by requiring
    // `category === 'background'` for background placements (front-end
    // palette + `canPlaceItemOnLayer`).
    // Multi-cell footprint must be entirely inside the board.
    const [x, y] = parseCellKey(key);
    if (x + cell.object.w > size || y + cell.object.h > size) {
      violations.push({
        rule: 'object_out_of_bounds',
        message: `物品 #${cell.object.itemId} (${cell.object.w}×${cell.object.h}) 越出画布`,
      });
    }
  }

  // ---- P3 — no overlapping region cells ----
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

  // ---- P5 — every linkage target must resolve ----
  const objectItemIds = new Set<number>();
  for (const key of Object.keys(draft.cells)) {
    const cell = draft.cells[key];
    if (!cell) continue;
    if (cell.object) objectItemIds.add(cell.object.itemId);
  }
  const regionIds = new Set(draft.regions.map((region) => region.id));
  draft.characterSlots.forEach((slot, slotIndex) => {
    if (!slot) return;
    // MOD-801: flat linkages list (was: triggers[].targets).
    for (const target of slot.linkages ?? []) {
      if (target.type === 'character' && !slotCharacterIds.has(target.id)) {
        violations.push({
          rule: 'participant_target',
          message: `参与者框 ${slotIndex + 1} 的联动目标角色 #${target.id} 不在参与者中`,
        });
      }
      if (target.type === 'item' && !objectItemIds.has(target.id)) {
        violations.push({
          rule: 'participant_target',
          message: `参与者框 ${slotIndex + 1} 的联动目标物品 #${target.id} 不在地图中`,
        });
      }
      if (target.type === 'region' && !regionIds.has(target.id)) {
        violations.push({
          rule: 'participant_target',
          message: `参与者框 ${slotIndex + 1} 的联动目标区域 ${target.id} 不在地图中`,
        });
      }
      // MOD-708: cell targets carry a `cells` array
      if (target.type === 'cell') {
        for (const [cx, cy] of target.cells) {
          if (cx < 0 || cy < 0 || cx >= size || cy >= size) {
            violations.push({
              rule: 'participant_target',
              message: `参与者框 ${slotIndex + 1} 的联动目标方格 (${cx}, ${cy}) 超出画布范围`,
            });
            break;
          }
        }
      }
    }
  });

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

/** OPT-905 (docs/v0.3.4.md §5): the works table spans every map. */
export async function listAllWorks(): Promise<WorkSummary[]> {
  return versionRepo.listAllVersions();
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
    participantCount: (row.data?.characterSlots ?? []).filter((slot) => slot !== null).length,
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
