import { db } from '../db/knex';
import type { MapDraft, MapVersionSummary, MapRow } from '@loredoku/shared';
import { absorbLegacyMapDraft, readLegacyCharacterSlots } from '../service/mapDraftCompat';
import * as versioning from './versioning';

/** `map_versions` 已并入 `maps`（docs/map-table-merge-design.md）：版本行 = `version <> 'draft'`。
 *  `version` 是 text，cast 前必须先排除 `'draft'`；默认查 `deleted_at IS NULL`（fork 源与 MAX 除外）；`:id` 指 `maps.id`。 */

/** `'draft'` → `null`，`'3'` → `3`。禁止在别处直接 `Number()`。 */
export function versionToNo(row: { version: string }): number | null {
  return row.version === 'draft' ? null : Number(row.version);
}

/** 版本行 —— 快照名就是该行自己的 `name`（发布时快照进 `maps.name`）。 */
export type VersionRow = MapRow;

/** FEAT-503: the version panel shows participant / region / item totals. */
function summarizeData(raw: unknown): {
  participantCount: number;
  regionCount: number;
  itemCount: number;
  gridSize: number;
} {
  const draft = (absorbLegacyMapDraft(raw) ?? null) as MapDraft | null;
  const assetIds = new Set<number>();
  for (const cell of Object.values(draft?.cells ?? {})) {
    if (cell?.item) assetIds.add(cell.item.assetId);
    if (cell?.background) assetIds.add(cell.background.assetId);
    if (cell?.decoration) assetIds.add(cell.decoration.assetId);
  }
  // participants live on puzzles, so this counts only legacy snapshots.
  const participantCount = readLegacyCharacterSlots(raw).filter((slot) => slot !== null).length;
  return {
    participantCount,
    regionCount: draft?.regions?.length ?? 0,
    itemCount: assetIds.size,
    gridSize: draft?.gridSize ?? 0,
  };
}

function toSummary(row: MapRow): MapVersionSummary {
  return {
    id: Number(row.id),
    versionNo: Number(row.version),
    // 版本行的 created_at 就是发布时间（插入即冻结）。
    publishedAt: new Date(row.created_at).toISOString(),
    ...summarizeData(row.data),
  };
}

/** Exported so the service can map lineage rows without duplicating the counts. */
export const toVersionSummary = toSummary;

/** `:id` → 血统根。**不过滤 `deleted_at`**：软删行仍可按 id 解析（设计 §15 P0-1）。 返回 `undefined` = 这个 id 根本不存在。 */
async function resolveRootId(id: number): Promise<number | undefined> {
  const row = (await db('maps').where({ id }).select('root_id').first()) as
    | { root_id: string | number }
    | undefined;
  return row ? Number(row.root_id) : undefined;
}

/** 血统内的版本行（活行），版本号倒序。`CAST` 前已排除 `'draft'`。 */
async function versionRowsOfRoot(rootId: number): Promise<MapRow[]> {
  return (await db<MapRow>('maps')
    .where({ root_id: rootId })
    .whereNot('version', 'draft')
    .whereNull('deleted_at')
    .orderByRaw('CAST(version AS integer) DESC')) as MapRow[];
}

/** Q3 = B (docs/v0.5.0.md §7.1): the version history lists the **whole blood lineage**, not just one `maps` row — a map forked from a published version shares the original's `root_id`, and its own publishes belong to the same list. */
export async function listVersionsForRoot(rootId: number): Promise<VersionRow[]> {
  const rows = await versionRowsOfRoot(rootId);
  return rows;
}

/** `:id` → 该血统的版本行（活行）。 */
export async function listVersions(id: number): Promise<MapVersionSummary[]> {
  const rootId = await resolveRootId(id);
  if (rootId === undefined) return [];
  return (await versionRowsOfRoot(rootId)).map(toSummary);
}

/** 版本详情带上快照名，预览页可自命名（docs/v0.4.0.md §2）；v0.5.8 起名字就是该行自己的快照名。
 *  {@link getVersion} 过滤 `deleted_at`（软删行直达也 404）；{@link findVersionRow} 不过滤，供 fork 源与快照提升。 */
export async function getVersion(
  id: number,
  versionNo: number,
): Promise<VersionRow | undefined> {
  return findVersionRow(id, versionNo, { includeDeleted: false });
}

/** 不过滤软删：fork 源 / 谜题 / 游戏引用读取用（§5.1）。 */
export async function findVersionRow(
  id: number,
  versionNo: number,
  options: { includeDeleted: boolean } = { includeDeleted: true },
): Promise<VersionRow | undefined> {
  const rootId = await resolveRootId(id);
  if (rootId === undefined) return undefined;
  const query = db<MapRow>('maps').where({ root_id: rootId, version: String(versionNo) });
  if (!options.includeDeleted) query.whereNull('deleted_at');
  const row = (await query.first()) as MapRow | undefined;
  return row;
}

/** SPEC-K11 + Q3 = B: 血统内下一个版本号。SQL 统一在 `repository/versioning.ts` （`puzzles` 用同一份实现），这里只把表名钉成 `maps`。 */
export async function nextVersionNo(rootId: number): Promise<number> {
  return versioning.nextVersionNo('maps', rootId);
}

/** 血统内该版本号是否已被占用（含软删行）。 */
export async function versionNoTaken(rootId: number, versionNo: number): Promise<boolean> {
  return versioning.versionNoTaken('maps', rootId, versionNo);
}

export interface CreateVersionData {
  /** 发布源 —— 必须是草稿行。 */
  owner: MapRow;
  versionNo: number;
  data: MapDraft;
}

export async function createVersion(data: CreateVersionData): Promise<MapVersionSummary> {
  // 发布 = INSERT 一条新 `maps` 行：name / description / cover 从此刻起是
  // **真实快照**（合并前版本条目只能借用工作条目的当前值，§5）。
  const [row] = (await db<MapRow>('maps')
    .insert({
      // 版本行继承草稿的主题 —— 同一血统必须同主题（迁移里有断言）。
      theme_id: data.owner.theme_id,
      root_id: data.owner.root_id,
      name: data.owner.name,
      description: data.owner.description,
      cover_path: data.owner.cover_path,
      data: data.data,
      version: String(data.versionNo),
    })
    .returning('*')) as MapRow[];
  return toSummary(row!);
}

/** FEAT-503: 删版本 = **软删**（`deleted_at`）：界面不展示，但行还在、号仍占 MAX、谜题引用仍可解析（设计 §2）。 */
export async function deleteVersion(id: number, versionNo: number): Promise<boolean> {
  const rootId = await resolveRootId(id);
  if (rootId === undefined) return false;
  const affected = await db('maps')
    .where({ root_id: rootId, version: String(versionNo) })
    .whereNull('deleted_at')
    .update({ deleted_at: db.fn.now() });
  return affected > 0;
}
