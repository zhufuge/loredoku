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

const SORT_COLUMNS = {
  updatedAt: 'updated_at',
  createdAt: 'created_at',
  name: 'name',
} as const;

type CountRow = { count?: string | number } | undefined;

/**
 * v0.5.8: 画布尺寸不再是列，读草稿即可。`null` = 这张地图还没初始化（创建时
 * 不再问尺寸，第一次进编辑器时才写）。
 */
export function draftGridSize(draft: MapDraft | null): number | null {
  const size = draft?.gridSize;
  return typeof size === 'number' && Number.isFinite(size) ? size : null;
}

export function toProject(row: ProjectRow): Project {
  return {
    id: Number(row.id),
    name: row.name,
    description: row.description,
    gridSize: draftGridSize(row.draft_data as MapDraft | null),
    coverPath: row.cover_path,
    coverUrl: row.cover_path ? buildFileUrl(row.cover_path) : null,
    status: row.status,
    currentVersionNo: row.current_version_no,
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

async function versionCounts(ids: number[]): Promise<Map<number, number>> {
  const result = new Map<number, number>();
  if (ids.length === 0) return result;
  const rows = (await db('map_versions')
    .whereIn('project_id', ids)
    .groupBy('project_id')
    .select('project_id')
    .count('id as count')) as Array<{ project_id: number | string; count: string | number }>;
  for (const row of rows) {
    result.set(Number(row.project_id), Number(row.count));
  }
  return result;
}

/**
 * FEAT-K09 (docs/v0.5.0.md §7.1) — the map list is a union of **work entries**
 * (`maps`) and **version entries** (`map_versions`), grouped by the
 * blood-lineage root (Q3 = B).
 *
 * The set is small (a personal authoring tool), and building the union in SQL
 * would need a `UNION ALL` plus a window function for the per-lineage counts,
 * so it is assembled in memory and paged here. That also keeps the keyword
 * filter — which has to match both kinds — in one place.
 */
export async function listMapEntries(
  params: ListProjectsParams,
): Promise<{ list: MapEntrySummary[]; total: number }> {
  const [projectRows, versionRows] = await Promise.all([
    db<ProjectRow>('maps').select('*') as Promise<ProjectRow[]>,
    db('map_versions as v')
      .join('maps as p', 'p.id', 'v.project_id')
      .select(
        'v.id as id',
        'v.version_no as version_no',
        'v.data as data',
        'v.snapshot_created_at as snapshot_created_at',
        'v.project_id as project_id',
        'p.name as name',
        'p.description as description',
        'p.cover_path as cover_path',
        'p.status as status',
        'p.root_id as root_id',
      ) as Promise<VersionEntryRow[]>,
  ]);

  // Per-lineage aggregates: highest version + version count of the whole root.
  const versionCountByRoot = new Map<number, number>();
  const maxVersionByRoot = new Map<number, number>();
  for (const row of versionRows) {
    const root = Number(row.root_id);
    versionCountByRoot.set(root, (versionCountByRoot.get(root) ?? 0) + 1);
    maxVersionByRoot.set(root, Math.max(maxVersionByRoot.get(root) ?? 0, row.version_no));
  }

  const entries: MapEntrySummary[] = [];

  for (const row of projectRows) {
    const root = Number(row.root_id ?? row.id);
    entries.push({
      id: Number(row.id),
      kind: 'draft',
      rootId: root,
      projectId: Number(row.id),
      versionNo: null,
      name: row.name,
      description: row.description,
      gridSize: draftGridSize(row.draft_data as MapDraft | null),
      coverPath: row.cover_path,
      coverUrl: row.cover_path ? buildFileUrl(row.cover_path) : null,
      status: row.status,
      currentVersionNo: maxVersionByRoot.get(root) ?? null,
      versionCount: versionCountByRoot.get(root) ?? 0,
      publishedAt: null,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    });
  }

  for (const row of versionRows) {
    const root = Number(row.root_id);
    const publishedAt = new Date(row.snapshot_created_at).toISOString();
    entries.push({
      id: Number(row.id),
      kind: 'version',
      rootId: root,
      projectId: Number(row.project_id),
      versionNo: row.version_no,
      name: row.name,
      description: row.description,
      gridSize: draftGridSize(row.data),
      coverPath: row.cover_path,
      coverUrl: row.cover_path ? buildFileUrl(row.cover_path) : null,
      status: row.status,
      currentVersionNo: maxVersionByRoot.get(root) ?? null,
      versionCount: versionCountByRoot.get(root) ?? 0,
      publishedAt,
      createdAt: publishedAt,
      updatedAt: publishedAt,
    });
  }

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

interface VersionEntryRow {
  id: string | number;
  version_no: number;
  data: MapDraft | null;
  snapshot_created_at: Date | string;
  project_id: string | number;
  name: string;
  description: string | null;
  cover_path: string | null;
  status: ProjectRow['status'];
  root_id: string | number;
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

export async function findById(id: number): Promise<ProjectRow | undefined> {
  return db<ProjectRow>('maps').where({ id }).first();
}

/**
 * FEAT-K03 §2.4: the 「地图版本」 picker's data source — **every published
 * version across every map**, newest first. Only published rows qualify: a
 * puzzle's canvas has to be an immutable snapshot.
 */
export async function listPublishedVersions(): Promise<PublishedMapVersion[]> {
  const rows = (await db('map_versions as v')
    .join('maps as p', 'p.id', 'v.project_id')
    .select(
      'v.project_id as project_id',
      'v.version_no as version_no',
      'v.data as data',
      'v.snapshot_created_at as snapshot_created_at',
      'p.name as map_name',
      'p.root_id as root_id',
    )
    .orderBy('v.snapshot_created_at', 'desc')) as Array<{
    project_id: string | number;
    version_no: number;
    data: unknown;
    snapshot_created_at: Date | string;
    map_name: string | null;
    root_id: string | number;
  }>;

  return rows.map((row) => ({
    projectId: Number(row.project_id),
    rootId: Number(row.root_id),
    versionNo: row.version_no,
    mapName: row.map_name ?? '未命名地图',
    // v0.5.8: `grid_size` 列删了，尺寸从快照自身读。
    gridSize: draftGridSize(absorbLegacyMapDraft(row.data) as MapDraft | null) ?? 0,
    publishedAt: new Date(row.snapshot_created_at).toISOString(),
  }));
}

export async function existsByName(name: string, excludeId?: number): Promise<boolean> {
  const query = db('maps').where({ name });
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
  const counts = draftCounts((row?.draft_data as MapDraft | null) ?? null);
  const versionRow = await db('map_versions').where({ project_id: id }).count('id as count').first();
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
 * two-statement transaction.
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

  const [row] = (await db<ProjectRow>('maps')
    .where({ id })
    .update(patch)
    .returning('*')) as ProjectRow[];
  return row ? toProject(row) : undefined;
}

export async function deleteProject(id: number): Promise<boolean> {
  const affected = await db('maps').where({ id }).del();
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
): Promise<ProjectRow | undefined> {
  const [row] = (await db<ProjectRow>('maps')
    .where({ id })
    .update({ cover_path: path, updated_at: db.fn.now() })
    .returning('*')) as ProjectRow[];
  return row;
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
    const source = await trx<ProjectRow>('maps').where({ id: sourceId }).first();
    if (!source) {
      return undefined;
    }

    const [created] = (await trx<ProjectRow>('maps')
      .insert({
        name: newName,
        description: source.description,
        cover_path: source.cover_path,
        status: 'draft',
        root_id: source.id,
        draft_data: source.draft_data,
        draft_updated_at: source.draft_data ? trx.fn.now() : null,
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
 * editing **without touching `map_versions`**. A new work entry is created in
 * the same lineage, seeded with the version's snapshot (absorbed into the v3
 * shape) and inheriting the map's cover (same convention as `duplicate`).
 *
 * Returns the created row's `ProjectDetail`, or `undefined` when the version
 * does not exist.
 */
export async function forkFromVersion(
  projectId: number,
  versionNo: number,
): Promise<ProjectDetail | undefined> {
  const createdId = await db.transaction(async (trx) => {
    const owner = (await trx<ProjectRow>('maps').where({ id: projectId }).first()) as
      | ProjectRow
      | undefined;
    if (!owner) return undefined;

    const version = (await trx('map_versions')
      .where({ project_id: projectId, version_no: versionNo })
      .first()) as { data: unknown } | undefined;
    if (!version) return undefined;

    const [row] = (await trx<ProjectRow>('maps')
      .insert({
        name: owner.name,
        description: owner.description,
        cover_path: owner.cover_path,
        status: 'draft',
        current_version_no: null,
        root_id: owner.root_id,
        draft_data: absorbLegacyMapDraft(version.data) as ProjectRow['draft_data'],
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
