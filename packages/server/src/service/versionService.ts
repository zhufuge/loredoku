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
import { uniqueName } from './mapService';
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
 * the participant rules (P1 / P2 / P5) went with the roster — a map is
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

  // ---- Asset references + multi-cell coverage (P4) ----
  const assetIds = new Set<number>();
  for (const key of Object.keys(draft.cells)) {
    const cell = draft.cells[key];
    if (!cell) continue;
    if (cell.item) assetIds.add(cell.item.assetId);
    if (cell.background) assetIds.add(cell.background.assetId);
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
    // OPT-904 (docs/v0.3.4.md §4.1): a blocking asset IS allowed on the
    // item layer. Only the background layer is restricted, and that is
    // enforced by requiring `type === 'background'` for background
    // placements (front-end palette + `canPlaceAssetOnLayer`).
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
 * FEAT-K10 (docs/v0.5.0.md §7.2): 发布 = 在 `maps` 里 **INSERT 一条新行**
 * （`version` = 版本号，`name` / `description` / `cover` 是此刻的快照），发布源
 * 那一行（草稿行）不动。
 *
 * Q3 = B: 号来自整个血统的最大值，所以从 `v3` fork 出的草稿下次发布是 `v4`。
 *
 * `versionNo` 可由用户
 * 指定（填空洞号），不传就是 `MAX+1`。血统内已有该号（**含软删行**，号不回收）
 * 直接 400。
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
 * SPEC-K11 / Q3 = B (docs/v0.5.0.md §7.3): "edit this version" never writes to
 * the source version row. It creates a **new work entry** — a fresh `maps` row
 * seeded with the version's snapshot — that stays in the same blood lineage, so
 * the next publish continues the version numbering instead of restarting at v1.
 *
 * 1. `data` 可传：版本条目进编辑器后「保存时才生成草稿」，body 的 data 是
 *    那一刻的编辑器画布（用户可能已经改过）；不传则用快照 data（版本历史
 *    面板「编辑此版本」—— 点哪条生成哪条）。
 * 2. 命名带来源：新行叫「{owner.name} (自 v{versionNo})」，撞名时按
 *    `uniqueName` 加副本后缀。血统内可能同时有多条草稿（fork 不删旧草稿），
 *    不带来源的话列表里分不清谁是谁。
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
  const name = await uniqueName(`${owner.name} (自 v${versionNo})`);
  const created = await mapRepo.forkFromVersion(mapId, versionNo, name, data);
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
 *
 * 目标行必须是草稿行 —— 合并后版本行也能出现在 `:id` 上，
 * 不拦就会把快照行覆盖掉（设计 §5.1）。
 */
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
