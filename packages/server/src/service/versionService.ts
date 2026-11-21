import { ErrorCode } from '@loredoku/shared';
import type {
  DraftRegion,
  MapDraft,
  MapVersionDetail,
  MapVersionEntry,
  MapVersionSummary,
  MapDetail,
  PublishViolation,
} from '@loredoku/shared';
import * as mapRepo from '../repository/mapRepository';
import * as versionRepo from '../repository/versionRepository';
import * as mapCanvasRepo from '../repository/mapCanvasRepository';
import * as assetRepo from '../repository/assetRepository';
import { AppError } from '../utils/AppError';
import { uniqueName } from './uniqueName';
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

/** 现行只两条：P3 区域格不重叠、P4 多格资源完整落在画布内（v0.3.1 §3.3，P1/P2/P5 随名册移除）。 */
export async function validateDraft(draft: MapDraft): Promise<PublishViolation[]> {
  const violations: PublishViolation[] = [];
  const size = draft.gridSize;

  // ---- Bounds check for cells / regions ----
  for (const [x, y, label] of collectCoords(draft)) {
    if (x < 0 || y < 0 || x >= size || y >= size) {
      violations.push({ rule: 'bounds', message: `${label} 超出边界` });
    }
  }

  // ---- Asset references + multi-cell coverage (P4) ----
  const assetIds = new Set<number>();
  for (const key of Object.keys(draft.cells)) {
    const cell = draft.cells[key];
    if (!cell) continue;
    if (cell.item) assetIds.add(cell.item.assetId);
    if (cell.background) assetIds.add(cell.background.assetId);
    // 背景修饰层：发布校验与导出体检（themeScope）同一把尺子。
    if (cell.decoration) assetIds.add(cell.decoration.assetId);
  }
  const meta = await assetRepo.assetMetaByIds([...assetIds]);
  for (const id of assetIds) {
    if (!meta.has(id)) {
      violations.push({ rule: 'asset_reference', message: `资源 #${id} 不存在` });
    }
  }
  for (const key of Object.keys(draft.cells)) {
    const cell = draft.cells[key];
    if (!cell?.item) continue;
    // 阻断型资源允许在物品层，只有背景层受限（`type === 'background'`）(v0.3.4 §4.1)。
    const [x, y] = parseCellKey(key);
    if (x + cell.item.w > size || y + cell.item.h > size) {
      violations.push({
        rule: 'item_out_of_bounds',
        message: `资源 #${cell.item.assetId} (${cell.item.w}×${cell.item.h}) 越出画布`,
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
 * 发布 = INSERT 一条版本行，草稿行不动；号取血统最大值（含软删，不回收），可由用户指定，撞号 400（v0.5.0 §7.2）。
 */
export async function publishMap(
  mapId: number,
  versionNo?: number,
): Promise<MapVersionSummary> {
  const mapRow = await mapCanvasRepo.getMapRow(mapId);
  if (!mapRow) {
    throw AppError.notFound('地图不存在');
  }
  if (mapRow.version !== 'draft') {
    throw AppError.validation('只有草稿可以发布');
  }
  const record = await mapCanvasRepo.getDraft(mapId);
  if (!record || record.draft === null) {
    // 创建地图时不写草稿，没初始化的地图没有可发布的画布。
    throw AppError.validation('请先在编辑器里初始化画布尺寸');
  }

  const violations = await validateDraft(record.draft);
  if (violations.length > 0) {
    throw new AppError(ErrorCode.PUBLISH_VALIDATION_FAILED, '发布校验未通过', violations);
  }

  const rootId = Number(mapRow.root_id);
  const target = versionNo ?? (await versionRepo.nextVersionNo(rootId));
  if (await versionRepo.versionNoTaken(rootId, target)) {
    throw AppError.validation(`版本号 v${target} 已存在于该地图血统中，请换一个`);
  }

  return versionRepo.createVersion({
    owner: mapRow,
    versionNo: target,
    // The snapshot is written in the v3 shape: a new version never carries the
    // roster or the palette, even when the working draft was seeded from v2.
    data: absorbLegacyMapDraft(record.draft) as MapDraft,
  });
}

export async function listVersions(mapId: number): Promise<MapVersionSummary[]> {
  const mapRow = await mapCanvasRepo.getMapRow(mapId);
  if (!mapRow) {
    throw AppError.notFound('地图不存在');
  }
  return versionRepo.listVersions(mapId);
}

/** SPEC-K13 §7.4: the version-history panel lists the whole blood lineage. */
export async function listMapVersions(mapId: number): Promise<MapVersionEntry[]> {
  const mapRow = await mapCanvasRepo.getMapRow(mapId);
  if (!mapRow) {
    throw AppError.notFound('地图不存在');
  }
  const rows = await versionRepo.listVersionsForRoot(Number(mapRow.root_id));
  return rows.map((row) => ({
    ...versionRepo.toVersionSummary(row),
    // 版本行自己就是 maps 行，所以这里就是版本行 id。
    mapId: Number(row.id),
  }));
}

export async function getVersion(mapId: number, versionNo: number): Promise<MapVersionDetail> {
  const row = await versionRepo.getVersion(mapId, versionNo);
  if (!row) {
    throw AppError.notFound('版本不存在');
  }
  const draft = absorbLegacyMapDraft(row.data) as MapDraft;
  const assetIds = new Set<number>();
  for (const cell of Object.values(draft?.cells ?? {})) {
    if (cell?.item) assetIds.add(cell.item.assetId);
    if (cell?.background) assetIds.add(cell.background.assetId);
    if (cell?.decoration) assetIds.add(cell.decoration.assetId);
  }
  return {
    id: Number(row.id),
    versionNo: Number(row.version),
    // 尺寸从快照自身读（详情页本来就要 data）。
    gridSize: draft.gridSize ?? 0,
    // 发布时间 = 版本行的插入时间（行插入即冻结）。
    publishedAt: new Date(row.created_at).toISOString(),
    data: draft,
    participantCount: 0,
    regionCount: draft?.regions?.length ?? 0,
    itemCount: assetIds.size,
    // OPT-G01: fall back for legacy rows whose mapRow name is missing.
    mapName: row.name ?? '未命名地图',
  };
}

export async function deleteVersion(mapId: number, versionNo: number): Promise<void> {
  const row = await versionRepo.getVersion(mapId, versionNo);
  if (!row) {
    throw AppError.notFound('版本不存在');
  }
  // 软删（界面不展示、行还在、号仍占 MAX）。
  await versionRepo.deleteVersion(mapId, versionNo);
}

/**
 * 「编辑此版本」只新建一条草稿行、绝不写源版本；`data` 不传就用版本快照，命名带 ` (自 v{n})` 区分血统里的多条草稿。
 */
export async function forkVersion(
  mapId: number,
  versionNo: number,
  data?: MapDraft,
): Promise<MapDetail> {
  // fork 源不过滤软删（设计 §5.1）：软删版本行也能当 `:id` 用。
  const owner = await mapRepo.findByIdIncludingDeleted(mapId);
  if (!owner) {
    throw AppError.notFound('地图不存在');
  }
  const name = await uniqueName(`${owner.name} (自 v${versionNo})`, mapRepo.existsByName);
  const created = await mapRepo.forkFromVersion(mapId, versionNo, name, data);
  if (!created) {
    throw AppError.notFound('版本不存在');
  }
  return created;
}

  // 目标行必须是草稿行，否则会把快照行覆盖掉（设计 §5.1）。
  /** @deprecated v0.5.0 §15 Q9: superseded by {@link forkVersion}. It wrote the snapshot **back into** the map's working draft, which is exactly the in-place mutation SPEC-K11 now forbids. Kept for historical callers with no UI entry point. */
export async function createDraftFromVersion(
  mapId: number,
  versionNo: number,
): Promise<{ draft: MapDraft }> {
  const target = await mapCanvasRepo.getMapRow(mapId);
  if (!target) {
    throw AppError.notFound('地图不存在');
  }
  if (target.version !== 'draft') {
    throw AppError.validation('已发布的版本不可修改');
  }
  // 源版本不过滤软删：过滤只管可见性（§5.1）。
  const row = await versionRepo.findVersionRow(mapId, versionNo);
  if (!row) {
    throw AppError.notFound('版本不存在');
  }
  const saved = await mapCanvasRepo.overwriteDraft(
    mapId,
    absorbLegacyMapDraft(row.data as MapDraft) as MapDraft,
  );
  if (!saved || saved.draft === null) {
    throw AppError.notFound('地图不存在');
  }
  return { draft: saved.draft };
}
