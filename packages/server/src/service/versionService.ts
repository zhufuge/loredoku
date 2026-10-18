import { ErrorCode } from '@loredoku/shared';
import type {
  DraftRegion,
  MapDraft,
  MapVersionDetail,
  MapVersionEntry,
  MapVersionSummary,
  ProjectDetail,
  PublishViolation,
} from '@loredoku/shared';
import * as mapRepo from '../repository/mapRepository';
import * as versionRepo from '../repository/versionRepository';
import * as projectRepo from '../repository/projectRepository';
import * as itemRepo from '../repository/itemRepository';
import { AppError } from '../utils/AppError';
import { absorbLegacyMapDraft } from './mapDraftCompat';

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
 * CLAR-603 (docs/v0.3.1.md §3.3) — the sudoku-style P1~P6 rules from v0.3.0 are
 * gone. The publish rules are:
 *   P3 — no overlapping region cells
 *   P4 — multi-cell items fully inside the board (OPT-904 removed the
 *        "non-standable items cannot sit on the object layer" rule)
 *
 * v0.5.0: the participant rules (P1 / P2 / P5) went with the roster — a map is
 * pure canvas now, and the puzzle is what carries participants.
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
    // object layer. Only the background layer is restricted, and that is
    // enforced by requiring `category === 'background'` for background
    // placements (front-end palette + `canPlaceItemOnLayer`).
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

  return violations;
}

/**
 * FEAT-K10 (docs/v0.5.0.md §7.2): publishing still inserts one `map_versions`
 * row, which the map list now shows as a **version entry**.
 *
 * Q3 = B: the number comes from the whole lineage's maximum, so a map forked
 * from `v3` publishes its next revision as `v4`.
 *
 * v0.5.8: 发布弹窗去掉备注，入参只剩 projectId。
 */
export async function publishProject(projectId: number): Promise<MapVersionSummary> {
  const project = await mapRepo.getProjectRow(projectId);
  if (!project) {
    throw AppError.notFound('地图不存在');
  }
  const record = await mapRepo.getDraft(projectId);
  if (!record || record.draft === null) {
    // v0.5.8: 创建地图不再写草稿，没初始化的地图没有可发布的画布。
    throw AppError.validation('请先在编辑器里初始化画布尺寸');
  }

  const violations = await validateDraft(record.draft);
  if (violations.length > 0) {
    throw new AppError(ErrorCode.PUBLISH_VALIDATION_FAILED, '发布校验未通过', violations);
  }

  const versionNo = await versionRepo.nextVersionNo(Number(project.root_id));
  return versionRepo.createVersion({
    projectId,
    versionNo,
    // The snapshot is written in the v3 shape: a new version never carries the
    // roster or the palette, even when the working draft was seeded from v2.
    data: absorbLegacyMapDraft(record.draft) as MapDraft,
  });
}

export async function listVersions(projectId: number): Promise<MapVersionSummary[]> {
  const project = await mapRepo.getProjectRow(projectId);
  if (!project) {
    throw AppError.notFound('地图不存在');
  }
  return versionRepo.listVersions(projectId);
}

/** SPEC-K13 §7.4: the version-history panel lists the whole blood lineage. */
export async function listVersionsForProject(projectId: number): Promise<MapVersionEntry[]> {
  const project = await mapRepo.getProjectRow(projectId);
  if (!project) {
    throw AppError.notFound('地图不存在');
  }
  const rows = await versionRepo.listVersionsForRoot(Number(project.root_id));
  return rows.map((row) => ({
    ...versionRepo.toVersionSummary(row),
    projectId: Number(row.project_id),
  }));
}

export async function getVersion(projectId: number, versionNo: number): Promise<MapVersionDetail> {
  const row = await versionRepo.getVersion(projectId, versionNo);
  if (!row) {
    throw AppError.notFound('版本不存在');
  }
  const draft = absorbLegacyMapDraft(row.data) as MapDraft;
  const itemIds = new Set<number>();
  for (const cell of Object.values(draft?.cells ?? {})) {
    if (cell?.object) itemIds.add(cell.object.itemId);
    if (cell?.background) itemIds.add(cell.background.itemId);
  }
  return {
    id: Number(row.id),
    versionNo: row.version_no,
    // v0.5.8: 列删了，尺寸从快照自身读（详情页本来就要 data）。
    gridSize: draft.gridSize ?? 0,
    publishedAt: new Date(row.snapshot_created_at).toISOString(),
    data: draft,
    participantCount: 0,
    regionCount: draft?.regions?.length ?? 0,
    itemCount: itemIds.size,
    // OPT-G01: fall back for legacy rows whose project name is missing.
    projectName: row.project_name ?? '未命名地图',
  };
}

export async function deleteVersion(projectId: number, versionNo: number): Promise<void> {
  const row = await versionRepo.getVersion(projectId, versionNo);
  if (!row) {
    throw AppError.notFound('版本不存在');
  }
  await versionRepo.deleteVersion(projectId, versionNo);
}

/**
 * SPEC-K11 / Q3 = B (docs/v0.5.0.md §7.3): "edit this version" never writes to
 * `map_versions`. It creates a **new work entry** — a fresh `maps` row
 * seeded with the version's snapshot — that stays in the same blood lineage, so
 * the next publish continues the version numbering instead of restarting at v1.
 */
export async function forkVersion(projectId: number, versionNo: number): Promise<ProjectDetail> {
  const created = await projectRepo.forkFromVersion(projectId, versionNo);
  if (!created) {
    throw AppError.notFound('版本不存在');
  }
  return created;
}

/**
 * @deprecated v0.5.0 §15 Q9: superseded by {@link forkVersion}. It wrote the
 * snapshot **back into** the map's working draft, which is exactly the
 * in-place mutation SPEC-K11 now forbids. Kept for historical callers with no
 * UI entry point.
 */
export async function createDraftFromVersion(
  projectId: number,
  versionNo: number,
): Promise<{ draft: MapDraft; updatedAt: string | null }> {
  const row = await versionRepo.getVersion(projectId, versionNo);
  if (!row) {
    throw AppError.notFound('版本不存在');
  }
  const saved = await mapRepo.overwriteDraft(projectId, absorbLegacyMapDraft(row.data) as MapDraft);
  if (!saved || saved.draft === null) {
    throw AppError.notFound('地图不存在');
  }
  return { draft: saved.draft, updatedAt: saved.updatedAt };
}
