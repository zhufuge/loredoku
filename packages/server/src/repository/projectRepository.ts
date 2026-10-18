import { db } from '../db/knex';
import { buildFileUrl } from '../utils/paths';
import type {
  MapDraft,
  MapEntrySummary,
  Project,
  ProjectDetail,
  ProjectRow,
  PublishedMapVersion,
} from '@loredoku/shared';
import { absorbLegacyMapDraft, readLegacyCharacterSlots } from '../service/mapDraftCompat';
import { findVersionRow, versionToNo } from './versionRepository';

export interface ListProjectsParams {
  page: number;
  pageSize: number;
  keyword?: string;
  sort: 'updatedAt' | 'name' | 'createdAt';
  order: 'asc' | 'desc';
}

export interface CreateProjectData {
  name: string;
  description: string | null;
}

export interface UpdateProjectData {
  name?: string;
  description?: string | null;
}

export type ProjectRowWithLineage = ProjectRow & {
  /** 血统最高版本号（子查询，含软删行）；`null` = 血统还没发布过。 */
  current_version_no?: number | string | null;
  /** 血统内可见版本数（子查询，不含软删行）。 */
  version_count?: number | string;
};

/**
 * v0.5.8 第三阶段：`status` / `current_version_no` 两列已删，改由血统推导 ——
 * 每个读单行的查询都带上这两个子查询，比在 service 里补查询少一趟往返。
 */
const LINEAGE_MAX_VERSION = db.raw(
  "(SELECT MAX(CAST(v.version AS integer)) FROM maps v WHERE v.root_id = m.root_id AND v.version <> 'draft') AS current_version_no",
);
const LINEAGE_VERSION_COUNT = db.raw(
  "(SELECT COUNT(*) FROM maps v WHERE v.root_id = m.root_id AND v.version <> 'draft' AND v.deleted_at IS NULL) AS version_count",
);

type CountRow = { count?: string | number } | undefined;

/**
 * v0.5.8: 画布尺寸不再是列，读草稿即可。`null` = 这张地图还没初始化（创建时
 * 不再问尺寸，第一次进编辑器时才写）。
 */
export function draftGridSize(draft: MapDraft | null): number | null {
  const size = draft?.gridSize;
  return typeof size === 'number' && Number.isFinite(size) ? size : null;
}

/**
 * `status` / `currentVersionNo` 在合并后都是**推导值**（设计 §3）：血统里有版本
 * 行就是 `published` + 最高号，否则 `draft` + `null`。字段名保留，前端零改动。
 */
export function toProject(row: ProjectRowWithLineage): Project {
  const versionNo = versionToNo(row);
  const lineageMax =
    row.current_version_no === undefined || row.current_version_no === null
      ? versionNo
      : Number(row.current_version_no);
  return {
    id: Number(row.id),
    name: row.name,
    description: row.description,
    gridSize: draftGridSize(row.data as MapDraft | null),
    coverPath: row.cover_path,
    coverUrl: row.cover_path ? buildFileUrl(row.cover_path) : null,
    status: lineageMax !== null ? 'published' : 'draft',
    currentVersionNo: lineageMax,
    versionNo,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function draftCounts(draft: MapDraft | null): {
  itemCount: number;
  regionCount: number;
  characterCount: number;
} {
  if (!draft) {
    return { itemCount: 0, regionCount: 0, characterCount: 0 };
  }
  let itemCount = 0;
  for (const key of Object.keys(draft.cells)) {
    if (draft.cells[key]?.object) itemCount += 1;
  }
  // v0.5.0: participants left the map; this counts only legacy drafts.
  const characterCount = readLegacyCharacterSlots(draft).filter((slot) => slot !== null).length;
  return {
    itemCount,
    regionCount: draft.regions?.length ?? 0,
    characterCount,
  };
}

/**
 * FEAT-K09 (docs/v0.5.0.md §7.1) — the map list is a union of **work entries**
 * and **version entries**. 合并后两者是同一张表的行，所以并集查询塌成
 * **一条单表查询**（`kind` 由 `version` 列判定），血统聚合用两个子查询。
 *
 * 软删的版本行不出现（设计 §5 四个过滤面之一）：漏掉这个条件，删掉的版本会
 * 「又冒出来」。
 */
export async function listMapEntries(
  params: ListProjectsParams,
): Promise<{ list: MapEntrySummary[]; total: number }> {
  const rows = (await db('maps as m')
    .select('m.*', LINEAGE_MAX_VERSION, LINEAGE_VERSION_COUNT)
    .whereNull('m.deleted_at')) as ProjectRowWithLineage[];

  const entries: MapEntrySummary[] = rows.map((row) => {
    const versionNo = versionToNo(row);
    const currentVersionNo =
      row.current_version_no === undefined || row.current_version_no === null
        ? versionNo
        : Number(row.current_version_no);
    const isVersion = versionNo !== null;
    const publishedAt = isVersion ? new Date(row.created_at).toISOString() : null;
    return {
      id: Number(row.id),
      kind: isVersion ? 'version' : 'draft',
      rootId: Number(row.root_id),
      // v0.5.8 第三阶段：版本行自己就是 maps 行，两个 id 相同。
      projectId: Number(row.id),
      versionNo,
      name: row.name,
      description: row.description,
      gridSize: draftGridSize(row.data as MapDraft | null),
      coverPath: row.cover_path,
      coverUrl: row.cover_path ? buildFileUrl(row.cover_path) : null,
      status: currentVersionNo !== null ? 'published' : 'draft',
      currentVersionNo,
      versionCount: Number(row.version_count ?? 0),
      publishedAt,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  });

  const keyword = params.keyword?.trim().toLowerCase();
  const filtered = keyword
    ? entries.filter(
        (entry) =>
          entry.name.toLowerCase().includes(keyword) ||
          (entry.description ?? '').toLowerCase().includes(keyword) ||
          (entry.versionNo !== null && `v${entry.versionNo}`.includes(keyword)),
      )
    : entries;

  const sorted = [...filtered].sort((a, b) => compareEntries(a, b, params.sort, params.order));
  const start = (params.page - 1) * params.pageSize;
  return { list: sorted.slice(start, start + params.pageSize), total: sorted.length };
}

/** The timestamp a "latest first" sort should use for each entry kind. */
function sortKey(entry: MapEntrySummary, sort: ListProjectsParams['sort']): string | number {
  if (sort === 'name') return entry.name;
  if (sort === 'createdAt') return entry.createdAt;
  return entry.updatedAt;
}

function compareEntries(
  a: MapEntrySummary,
  b: MapEntrySummary,
  sort: ListProjectsParams['sort'],
  order: 'asc' | 'desc',
): number {
  const left = sortKey(a, sort);
  const right = sortKey(b, sort);
  let result = left < right ? -1 : left > right ? 1 : 0;
  if (result === 0) {
    // A work entry leads its own versions, newest version first.
    if (a.kind !== b.kind) return a.kind === 'draft' ? -1 : 1;
    result = (b.versionNo ?? 0) - (a.versionNo ?? 0);
  }
  return order === 'asc' ? result : -result;
}

/**
 * 软删的行（只可能是版本行）在这里一律不可见 —— 详情、改名、封面、画布写入
 * 全部走这条路，语义统一成「不存在」。
 */
export async function findById(id: number): Promise<ProjectRowWithLineage | undefined> {
  return db('maps as m')
    .select('m.*', LINEAGE_MAX_VERSION, LINEAGE_VERSION_COUNT)
    .where('m.id', id)
    .whereNull('m.deleted_at')
    .first() as Promise<ProjectRowWithLineage | undefined>;
}

/**
 * 不过滤软删的按 id 读取 —— 只有 fork 用得上：设计 §5.1 明确「fork 源读取不过滤
 * `deleted_at`」（过滤管可见性，不管直达读取）。
 */
export async function findByIdIncludingDeleted(
  id: number,
): Promise<ProjectRowWithLineage | undefined> {
  return db('maps as m')
    .select('m.*', LINEAGE_MAX_VERSION, LINEAGE_VERSION_COUNT)
    .where('m.id', id)
    .first() as Promise<ProjectRowWithLineage | undefined>;
}

/**
 * FEAT-K03 §2.4: the 「地图版本」 picker's data source — **every published
 * version across every map**, newest first. 合并后版本行就是 maps 行，一次
 * 单表查询即可；软删行过滤掉，名字用发布时的快照（§15 P0-3）。
 */
export async function listPublishedVersions(): Promise<PublishedMapVersion[]> {
  const rows = (await db('maps')
    .whereNot('version', 'draft')
    .whereNull('deleted_at')
    .orderBy('created_at', 'desc')) as ProjectRow[];

  return rows.map((row) => ({
    projectId: Number(row.id),
    rootId: Number(row.root_id),
    versionNo: Number(row.version),
    mapName: row.name || '未命名地图',
    gridSize: draftGridSize(absorbLegacyMapDraft(row.data) as MapDraft | null) ?? 0,
    publishedAt: new Date(row.created_at).toISOString(),
  }));
}

/**
 * v0.5.8 第三阶段（设计 §5.2）：查重**只查草稿行**。版本名是发布时的快照，
 * 不改名连发十个就都叫一个名字 —— 不限定的话，新建地图会撞上某个历史版本名，
 * fork 草稿沿用 owner 名也会挡住之后所有的创建 / 改名。
 */
export async function existsByName(name: string, excludeId?: number): Promise<boolean> {
  const query = db('maps').where({ name, version: 'draft' });
  if (excludeId !== undefined) {
    query.whereNot('id', excludeId);
  }
  const row = await query.first();
  return Boolean(row);
}

export async function getProjectCounts(
  id: number,
): Promise<Omit<ProjectDetail, keyof Project>> {
  const row = await findById(id);
  const counts = draftCounts((row?.data as MapDraft | null) ?? null);
  const versionRow = row
    ? await db('maps')
        .where({ root_id: row.root_id })
        .whereNot('version', 'draft')
        .whereNull('deleted_at')
        .count('id as count')
        .first()
    : undefined;
  return {
    cardCount: counts.itemCount,
    itemCount: counts.itemCount,
    regionCount: counts.regionCount,
    characterCount: counts.characterCount,
    versionCount: Number((versionRow as CountRow)?.count ?? 0),
  };
}

/**
 * v0.5.8: a new map has **no** draft and no canvas size — the first editor
 * entry initialises both (尺寸弹窗 / 导入). `root_id = id` still needs the
 * two-statement transaction. `version` 由 DB 默认值 `'draft'` 兜住。
 */
export async function createProject(data: CreateProjectData): Promise<Project> {
  return db.transaction(async (trx) => {
    const [row] = (await trx<ProjectRow>('maps')
      .insert({
        name: data.name,
        description: data.description,
        root_id: 0,
      })
      .returning('*')) as ProjectRow[];
    const [fixed] = (await trx<ProjectRow>('maps')
      .where({ id: row!.id })
      .update({ root_id: row!.id })
      .returning('*')) as ProjectRow[];
    return toProject(fixed!);
  });
}

export async function updateProject(
  id: number,
  data: UpdateProjectData,
): Promise<Project | undefined> {
  const patch: Record<string, unknown> = { updated_at: db.fn.now() };
  if (data.name !== undefined) patch.name = data.name;
  if (data.description !== undefined) patch.description = data.description;

  const affected = await db('maps').where({ id }).whereNull('deleted_at').update(patch);
  if (affected === 0) return undefined;
  const row = await findById(id);
  return row ? toProject(row) : undefined;
}

/**
 * 删工作条目 = **硬删草稿行**。版本行不牵连（软删是另一条路）——
 * 所以「删地图」不再级联删掉历史版本（设计 §2）。
 */
export async function deleteProject(id: number): Promise<boolean> {
  const affected = await db('maps').where({ id, version: 'draft' }).del();
  return affected > 0;
}

/**
 * FEAT-H03 §3.2(c) (docs/v0.4.2.md §3): the only writer of `cover_path`. `null`
 * clears the cover (the `DELETE` route); a path stores the freshly processed
 * image. Map covers keep no mime/size metadata — the column was created before
 * that idea existed, and the card only needs the URL.
 */
export async function updateCoverPath(
  id: number,
  path: string | null,
): Promise<ProjectRowWithLineage | undefined> {
  const affected = await db('maps')
    .where({ id })
    .whereNull('deleted_at')
    .update({ cover_path: path, updated_at: db.fn.now() });
  if (affected === 0) return undefined;
  return findById(id);
}

/**
 * 「复制」creates an **independent map**: the copy is its own lineage root
 * (unlike `forkFromVersion`, which deliberately stays in the original's
 * lineage). The draft is copied wholesale — its roster / palette, if any, are
 * simply no longer read.
 */
export async function duplicateProject(
  sourceId: number,
  newName: string,
): Promise<Project | undefined> {
  return db.transaction(async (trx) => {
    const source = (await trx<ProjectRow>('maps').where({ id: sourceId }).first()) as
      | ProjectRow
      | undefined;
    if (!source) {
      return undefined;
    }

    const [created] = (await trx<ProjectRow>('maps')
      .insert({
        name: newName,
        description: source.description,
        cover_path: source.cover_path,
        root_id: source.id,
        data: source.data,
        draft_updated_at: source.data ? trx.fn.now() : null,
      })
      .returning('*')) as ProjectRow[];

    // `root_id` must point at the copy itself, not at the source.
    const [fixed] = (await trx<ProjectRow>('maps')
      .where({ id: created!.id })
      .update({ root_id: created!.id })
      .returning('*')) as ProjectRow[];

    return toProject(fixed!);
  });
}

/**
 * SPEC-K11 / Q3 = B (docs/v0.5.0.md §7.3): opens a published version for
 * editing **without touching the version row**. A new work entry (`version =
 * 'draft'`) is created in the same lineage, seeded with the version's snapshot
 * and inheriting the map's cover (same convention as `duplicate`).
 *
 * v0.5.8 §13: `name` 由 service 传入（「{owner.name} (自 v{versionNo})」+
 * 查重兜底，血统内可能有多条草稿，命名必须带来源）；`data` 可传编辑器当前
 * 画布（「保存时才生成草稿」那条路），不传则用快照 data。
 *
 * fork 源**不过滤软删**（设计 §5.1）：过滤管可见性，不管直达读取。
 *
 * Returns the created row's `ProjectDetail`, or `undefined` when the version
 * does not exist.
 */
export async function forkFromVersion(
  id: number,
  versionNo: number,
  name: string,
  data?: MapDraft,
): Promise<ProjectDetail | undefined> {
  const createdId = await db.transaction(async (trx) => {
    const owner = (await trx<ProjectRow>('maps').where({ id }).first()) as ProjectRow | undefined;
    if (!owner) return undefined;

    const version = (await trx<ProjectRow>('maps')
      .where({ root_id: owner.root_id, version: String(versionNo) })
      .first()) as ProjectRow | undefined;
    if (!version) return undefined;

    const draft = (data ?? version.data) as MapDraft;
    const [row] = (await trx<ProjectRow>('maps')
      .insert({
        name,
        description: owner.description,
        cover_path: owner.cover_path,
        root_id: owner.root_id,
        data: absorbLegacyMapDraft(draft) as ProjectRow['data'],
        draft_updated_at: trx.fn.now(),
      })
      .returning('*')) as ProjectRow[];
    return Number(row!.id);
  });

  if (createdId === undefined) return undefined;
  const row = await findById(createdId);
  if (!row) return undefined;
  return { ...toProject(row), ...(await getProjectCounts(createdId)) };
}

/** 供 service 做「这行是版本行吗」的护栏判断，避免把 cast 散到各处。 */
export { findVersionRow };
