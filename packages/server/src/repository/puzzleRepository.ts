import { db } from '../db/knex';
import { absorbLegacyPuzzleDraft, puzzleGridSize } from '@loredoku/shared';
import type { PuzzleDraft, PuzzleEntrySummary, PuzzleRow } from '@loredoku/shared';
import { buildFileUrl } from '../utils/paths';
import { versionToNo } from './versionRepository';

/**
 * `puzzles` 仓储（v0.7.1 §5.1 / §6.3）。
 *
 * 一行 = 一个谜题条目：`version = 'draft'` 是工作条目，纯数字串是已发布版本；
 * 草稿行**硬删**、版本行**软删**（版本行的写入口在 `puzzleVersionRepository`）。
 *
 * 谜题自带底图画布（`data.map.data`），所以这里没有 `map_project_id` 的 join，
 * 尺寸也只有一个来源：`puzzleGridSize(draft)`。
 */

export interface ListPuzzlesParams {
  page: number;
  pageSize: number;
  keyword?: string;
  kind?: 'draft' | 'version';
  sort: 'updatedAt' | 'name' | 'createdAt';
  order: 'asc' | 'desc';
}

export type PuzzleRowWithLineage = PuzzleRow & {
  /** 血统最高版本号（子查询，含软删行）；`null` = 血统还没发布过。 */
  current_version_no?: number | string | null;
  /** 血统内可见版本数（子查询，不含软删行）。 */
  version_count?: number | string;
  /** 挂着**未删**的 game（取消部署的假删行不算）。 */
  deployed?: boolean;
};

const LINEAGE_MAX_VERSION = db.raw(
  "(SELECT MAX(CAST(v.version AS integer)) FROM puzzles v WHERE v.root_id = pz.root_id AND v.version <> 'draft') AS current_version_no",
);
const LINEAGE_VERSION_COUNT = db.raw(
  "(SELECT COUNT(*) FROM puzzles v WHERE v.root_id = pz.root_id AND v.version <> 'draft' AND v.deleted_at IS NULL) AS version_count",
);
const DEPLOYED = db.raw(
  '(EXISTS (SELECT 1 FROM games g WHERE g.puzzle_id = pz.id AND g.deleted_at IS NULL)) AS deployed',
);

const SELECT_WITH_LINEAGE = ['pz.*', LINEAGE_MAX_VERSION, LINEAGE_VERSION_COUNT, DEPLOYED];

function isDeployed(value: unknown): boolean {
  return value === true || value === 't' || value === 1;
}

/**
 * `PuzzleEntrySummary` 的单点映射。底图来源（`mapId` / `mapName` /
 * `mapVersionNo`）读自 JSON 快照 —— 没有列，也不该有列。
 */
export function toPuzzleEntry(row: PuzzleRowWithLineage): PuzzleEntrySummary {
  const draft = absorbLegacyPuzzleDraft(row.data);
  const versionNo = versionToNo(row);
  const lineageMax =
    row.current_version_no === undefined || row.current_version_no === null
      ? versionNo
      : Number(row.current_version_no);
  return {
    id: Number(row.id),
    kind: versionNo === null ? 'draft' : 'version',
    rootId: Number(row.root_id),
    versionNo,
    name: row.name,
    description: row.description,
    gridSize: draft ? puzzleGridSize(draft) : 0,
    mapId: draft?.map?.mapId ?? 0,
    mapName: draft?.map?.mapName ?? '',
    mapVersionNo: draft?.map?.versionNo ?? 0,
    coverPath: row.cover_path,
    coverUrl: row.cover_path ? buildFileUrl(row.cover_path) : null,
    currentVersionNo: lineageMax,
    versionCount: Number(row.version_count ?? 0),
    publishedAt: versionNo === null ? null : new Date(row.created_at).toISOString(),
    deployed: isDeployed(row.deployed),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

/**
 * 谜题列表：与地图列表同构 —— 一条单表查询取两块的并集，`kind` 由 `version`
 * 列判定，`kind` 参数让「草稿」「版本」各自分页（前端发两个请求，各自的总数才准）。
 *
 * 排序必须在服务端做：客户端只能排当前页，跨页会乱。同键时次序固定 —— 草稿行
 * 排在它自己的版本前面，版本之间新号在前。
 */
export async function listPuzzleEntries(
  params: ListPuzzlesParams,
): Promise<{ list: PuzzleEntrySummary[]; total: number }> {
  const rows = (await db('puzzles as pz')
    .select(...SELECT_WITH_LINEAGE)
    .whereNull('pz.deleted_at')) as PuzzleRowWithLineage[];

  const entries = rows.map(toPuzzleEntry);
  const byKind = params.kind ? entries.filter((entry) => entry.kind === params.kind) : entries;

  const keyword = params.keyword?.trim().toLowerCase();
  const filtered = keyword
    ? byKind.filter(
        (entry) =>
          entry.name.toLowerCase().includes(keyword) ||
          (entry.description ?? '').toLowerCase().includes(keyword) ||
          (entry.versionNo !== null && `v${entry.versionNo}`.includes(keyword)),
      )
    : byKind;

  const sorted = [...filtered].sort((a, b) => compareEntries(a, b, params.sort, params.order));
  const start = (params.page - 1) * params.pageSize;
  return { list: sorted.slice(start, start + params.pageSize), total: sorted.length };
}

function sortKey(entry: PuzzleEntrySummary, sort: ListPuzzlesParams['sort']): string {
  if (sort === 'name') return entry.name;
  if (sort === 'createdAt') return entry.createdAt;
  return entry.updatedAt;
}

function compareEntries(
  a: PuzzleEntrySummary,
  b: PuzzleEntrySummary,
  sort: ListPuzzlesParams['sort'],
  order: 'asc' | 'desc',
): number {
  const left = sortKey(a, sort);
  const right = sortKey(b, sort);
  const result = left < right ? -1 : left > right ? 1 : 0;
  if (result !== 0) return order === 'asc' ? result : -result;
  if (a.kind !== b.kind) return a.kind === 'draft' ? -1 : 1;
  return (b.versionNo ?? 0) - (a.versionNo ?? 0);
}

/** 软删的版本行一律不可见（详情 / 改名 / 封面 / 保存全走这条路）。 */
export async function findById(id: number): Promise<PuzzleRowWithLineage | undefined> {
  return db('puzzles as pz')
    .select(...SELECT_WITH_LINEAGE)
    .where('pz.id', id)
    .whereNull('pz.deleted_at')
    .first() as Promise<PuzzleRowWithLineage | undefined>;
}

/** 不过滤软删 —— 只有 fork 用得上（过滤管可见性，不管直达读取）。 */
export async function findByIdIncludingDeleted(
  id: number,
): Promise<PuzzleRowWithLineage | undefined> {
  return db('puzzles as pz')
    .select(...SELECT_WITH_LINEAGE)
    .where('pz.id', id)
    .first() as Promise<PuzzleRowWithLineage | undefined>;
}

export interface CreatePuzzleData {
  name: string;
  description: string | null;
  data: PuzzleDraft;
}

/**
 * 新谜题 = 一条草稿行，`root_id` 指向自己（与 `createMap` 同款的两句事务）。
 * `version` 由 DB 默认值 `'draft'` 兜住。
 */
export async function createPuzzle(input: CreatePuzzleData): Promise<PuzzleRowWithLineage> {
  const createdId = await db.transaction(async (trx) => {
    const [row] = (await trx<PuzzleRow>('puzzles')
      .insert({
        root_id: 0,
        name: input.name,
        description: input.description,
        data: input.data,
      })
      .returning('id')) as Array<{ id: string | number }>;
    const id = Number(row!.id);
    await trx('puzzles').where({ id }).update({ root_id: id });
    return id;
  });

  const created = await findById(createdId);
  if (!created) throw new Error('谜题创建后读取失败');
  return created;
}

/**
 * 乐观并发的保存（照 `mapRepository.saveDraft`）：`undefined` = 不存在，
 * `null` = `expectedUpdatedAt` 过期。
 *
 * `name` / `description` 从 JSON 镜像回行 —— 列表行与导出的文件不能各说一套。
 */
export async function savePuzzleDraft(
  id: number,
  expectedUpdatedAt: string | null,
  data: PuzzleDraft,
): Promise<PuzzleRowWithLineage | null | undefined> {
  const outcome = await db.transaction(async (trx) => {
    const row = (await trx('puzzles').where({ id }).forUpdate().first()) as PuzzleRow | undefined;
    if (!row) return 'missing' as const;

    const current = row.updated_at ? new Date(row.updated_at).toISOString() : null;
    if ((expectedUpdatedAt ?? null) !== current) return 'stale' as const;

    await trx('puzzles')
      .where({ id })
      .update({ name: data.name, description: data.description, data, updated_at: trx.fn.now() });
    return 'saved' as const;
  });

  if (outcome === 'missing') return undefined;
  if (outcome === 'stale') return null;
  return findById(id);
}

export interface UpdatePuzzleData {
  name?: string;
  description?: string | null;
}

export async function updatePuzzle(
  id: number,
  patch: UpdatePuzzleData,
): Promise<PuzzleRowWithLineage | undefined> {
  const updated = await db.transaction(async (trx) => {
    const row = (await trx('puzzles').where({ id }).forUpdate().first()) as PuzzleRow | undefined;
    if (!row) return false;

    const columns: Record<string, unknown> = { updated_at: trx.fn.now() };
    if (patch.name !== undefined) columns['name'] = patch.name;
    if (patch.description !== undefined) columns['description'] = patch.description;

    const data = absorbLegacyPuzzleDraft(row.data);
    if (data) {
      const next: PuzzleDraft = { ...data };
      if (patch.name !== undefined) next.name = patch.name;
      if (patch.description !== undefined) next.description = patch.description ?? '';
      columns['data'] = next;
    }

    await trx('puzzles').where({ id }).update(columns);
    return true;
  });
  return updated ? findById(id) : undefined;
}

/** 删草稿行 = **硬删**（版本行走软删，另一个入口）。 */
export async function deletePuzzle(id: number): Promise<boolean> {
  const affected = await db('puzzles').where({ id, version: 'draft' }).del();
  return affected > 0;
}

/**
 * 「复制」create an independent puzzle：副本是它自己血统的根（与 fork 不同，
 * fork 留在原血统里续号）。底图画布随之整份复制 —— 谜题自带画布，所以复制
 * 不需要再问地图要数据。
 */
export async function duplicatePuzzle(
  sourceId: number,
  newName: string,
): Promise<PuzzleRowWithLineage | undefined> {
  const createdId = await db.transaction(async (trx) => {
    const source = (await trx<PuzzleRow>('puzzles').where({ id: sourceId }).first()) as
      | PuzzleRow
      | undefined;
    if (!source) return undefined;

    const data = absorbLegacyPuzzleDraft(source.data);
    const [row] = (await trx<PuzzleRow>('puzzles')
      .insert({
        root_id: 0,
        name: newName,
        description: source.description,
        cover_path: source.cover_path,
        data: data ? { ...data, name: newName } : source.data,
      })
      .returning('id')) as Array<{ id: string | number }>;
    const id = Number(row!.id);
    await trx('puzzles').where({ id }).update({ root_id: id });
    return id;
  });

  return createdId === undefined ? undefined : findById(createdId);
}

/**
 * 只服务**自动取名**（复制 / fork 的「副本 N」序列）。限定 `version='draft'`：
 * 版本名是发布时的快照，拿版本名占位会让副本序号莫名跳号。
 */
export async function existsByName(name: string): Promise<boolean> {
  const row = await db('puzzles').where({ name, version: 'draft' }).first('id');
  return Boolean(row);
}

/** 封面的唯一写入口：`null` = 清除（`DELETE /:id/cover`）。 */
export async function updateCoverPath(
  id: number,
  path: string | null,
): Promise<PuzzleRowWithLineage | undefined> {
  const affected = await db('puzzles')
    .where({ id })
    .whereNull('deleted_at')
    .update({ cover_path: path, updated_at: db.fn.now() });
  if (affected === 0) return undefined;
  return findById(id);
}
