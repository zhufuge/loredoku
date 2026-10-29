import { db } from '../db/knex';
import { absorbLegacyPuzzleDraft } from '@loredoku/shared';
import type { PuzzleDraft, PuzzleRow } from '@loredoku/shared';
import * as versioning from './versioning';

/**
 * 谜题的版本仓储（v0.7.1 §5.2）—— 与 `versionRepository`（地图）平行的一份，
 * 唯一的差别是表名与行数据类型；版本号 / 占用检查的 SQL 在
 * `repository/versioning.ts`，两条路径共用一份口径。
 *
 * 三条语义与 `maps` 完全同构：
 *
 * 1. 发布 = **INSERT 一条新行**（`version` 是号，`name` / `description` /
 *    `cover_path` / `data` 是此刻快照），草稿行不动。
 * 2. 删草稿行 = 硬删（走 `puzzleRepository.deletePuzzle`）；删版本行 = **软删**
 *    （界面消失、行保留、号仍占 MAX）。
 * 3. 版本行**只读**：`data` 与元信息都不写，改内容只能 fork 出新草稿行。
 */
export type PuzzleVersionRow = PuzzleRow;

/**
 * `:id` → 血统根。**不过滤 `deleted_at`**：软删的版本行仍可作为 `:id` 解析出
 * 血统（过滤只管可见性，不管直达读取）。
 */
async function resolveRootId(id: number): Promise<number | undefined> {
  const row = (await db('puzzles').where({ id }).select('root_id').first()) as
    | { root_id: string | number }
    | undefined;
  return row ? Number(row.root_id) : undefined;
}

/** 血统内的版本行（活行），版本号倒序。 */
export async function listVersionRows(rootId: number): Promise<PuzzleRow[]> {
  return versioning.listVersionRows<PuzzleRow>('puzzles', rootId);
}

/** `:id` 所在血统的版本行（活行）。 */
export async function listVersions(id: number): Promise<PuzzleRow[]> {
  const rootId = await resolveRootId(id);
  if (rootId === undefined) return [];
  return listVersionRows(rootId);
}

/**
 * 版本行按号读取。两个口径必须分开（同 `versionRepository`）：
 * `includeDeleted: false` 供**详情**（软删行的直达链接也 404），`true` 供
 * **fork 源**（行还在就能拿来生成草稿）。
 */
export async function getVersion(
  id: number,
  versionNo: number,
  options: { includeDeleted: boolean } = { includeDeleted: false },
): Promise<PuzzleRow | undefined> {
  const rootId = await resolveRootId(id);
  if (rootId === undefined) return undefined;
  const query = db<PuzzleRow>('puzzles').where({ root_id: rootId, version: String(versionNo) });
  if (!options.includeDeleted) query.whereNull('deleted_at');
  return query.first();
}

export async function nextVersionNo(rootId: number): Promise<number> {
  return versioning.nextVersionNo('puzzles', rootId);
}

export async function versionNoTaken(rootId: number, versionNo: number): Promise<boolean> {
  return versioning.versionNoTaken('puzzles', rootId, versionNo);
}

export interface CreatePuzzleVersionData {
  /** 发布源 —— 必须是草稿行。 */
  owner: PuzzleRow;
  versionNo: number;
  data: PuzzleDraft;
}

/** 发布：INSERT 一条版本行，`name` / `description` / 封面从此刻起是真实快照。 */
export async function createVersion(data: CreatePuzzleVersionData): Promise<PuzzleRow> {
  const [row] = (await db<PuzzleRow>('puzzles')
    .insert({
      // v0.8.0：版本行继承草稿的主题 —— 同一血统必须同主题（迁移里有断言）。
      theme_id: data.owner.theme_id,
      root_id: data.owner.root_id,
      version: String(data.versionNo),
      name: data.owner.name,
      description: data.owner.description,
      cover_path: data.owner.cover_path,
      data: data.data,
    })
    .returning('*')) as PuzzleRow[];
  return row!;
}

/** 删版本 = 软删：界面不展示，行还在、号仍占 MAX。 */
export async function deleteVersion(id: number, versionNo: number): Promise<boolean> {
  const rootId = await resolveRootId(id);
  if (rootId === undefined) return false;
  const affected = await db('puzzles')
    .where({ root_id: rootId, version: String(versionNo) })
    .whereNull('deleted_at')
    .update({ deleted_at: db.fn.now() });
  return affected > 0;
}

/**
 * 「编辑此版本」= 在同血统里新建一条**草稿行**，版本行一个字节都不动。
 *
 * `name` 由 service 传入（「{name} (自 v{n})」+ 查重兜底）；`data.name` 也要
 * 跟着改 —— 行名与 JSON 名是两个必须同源的副本。
 *
 * `data` 可传编辑器当前的草稿（v0.7.2 §3.3「保存时才生成草稿」那条路，画布与
 * 参与者配置都是作者刚改过的版本）；不传则用版本快照。
 *
 * fork 源**不过滤软删**：软删版本也能拿来开新草稿。
 */
export async function forkVersion(
  id: number,
  versionNo: number,
  name: string,
  data?: PuzzleDraft,
): Promise<PuzzleRow | undefined> {
  return db.transaction(async (trx) => {
    const owner = (await trx<PuzzleRow>('puzzles').where({ id }).first()) as
      | PuzzleRow
      | undefined;
    if (!owner) return undefined;

    const version = (await trx<PuzzleRow>('puzzles')
      .where({ root_id: owner.root_id, version: String(versionNo) })
      .first()) as PuzzleRow | undefined;
    if (!version) return undefined;

    const source = data ?? absorbLegacyPuzzleDraft(version.data);
    const [row] = (await trx<PuzzleRow>('puzzles')
      .insert({
        theme_id: owner.theme_id,
        root_id: owner.root_id,
        name,
        description: version.description,
        cover_path: version.cover_path,
        data: source ? { ...source, name } : version.data,
      })
      .returning('*')) as PuzzleRow[];
    return row;
  });
}
