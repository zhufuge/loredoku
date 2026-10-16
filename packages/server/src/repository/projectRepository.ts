import { db } from '../db/knex';
import { buildFileUrl } from '../utils/paths';
import type { MapDraft, Project, ProjectDetail, ProjectRow } from '@loredoku/shared';

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
  gridSize: number;
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

export function toProject(row: ProjectRow): Project {
  return {
    id: Number(row.id),
    name: row.name,
    description: row.description,
    gridSize: row.grid_size,
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
  // CLAR-603: participants live in the roster; non-null slots are participants.
  const characterCount = (draft.characterSlots ?? []).filter(
    (slot) => slot !== null,
  ).length;
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

export async function listProjects(
  params: ListProjectsParams,
): Promise<{ list: ProjectDetail[]; total: number }> {
  const query = db<ProjectRow>('map_projects');
  if (params.keyword) {
    query.where('name', 'ilike', `%${params.keyword}%`);
  }

  const countRow = (await query.clone().count('id as count').first()) as CountRow;
  const total = Number(countRow?.count ?? 0);

  const rows = (await query
    .clone()
    .orderBy(SORT_COLUMNS[params.sort], params.order)
    .limit(params.pageSize)
    .offset((params.page - 1) * params.pageSize)
    .select('*')) as ProjectRow[];

  const ids = rows.map((row) => Number(row.id));
  const versions = await versionCounts(ids);

  const list = rows.map((row) => {
    const counts = draftCounts(row.draft_data as MapDraft | null);
    return {
      ...toProject(row),
      cardCount: counts.itemCount,
      itemCount: counts.itemCount,
      regionCount: counts.regionCount,
      characterCount: counts.characterCount,
      versionCount: versions.get(Number(row.id)) ?? 0,
    };
  });

  return { list, total };
}

export async function findById(id: number): Promise<ProjectRow | undefined> {
  return db<ProjectRow>('map_projects').where({ id }).first();
}

export async function existsByName(name: string, excludeId?: number): Promise<boolean> {
  const query = db('map_projects').where({ name });
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

export async function createProject(data: CreateProjectData): Promise<Project> {
  const [row] = (await db<ProjectRow>('map_projects')
    .insert({
      name: data.name,
      description: data.description,
      grid_size: data.gridSize,
    })
    .returning('*')) as ProjectRow[];
  return toProject(row!);
}

export async function updateProject(
  id: number,
  data: UpdateProjectData,
): Promise<Project | undefined> {
  const patch: Record<string, unknown> = { updated_at: db.fn.now() };
  if (data.name !== undefined) patch.name = data.name;
  if (data.description !== undefined) patch.description = data.description;

  const [row] = (await db<ProjectRow>('map_projects')
    .where({ id })
    .update(patch)
    .returning('*')) as ProjectRow[];
  return row ? toProject(row) : undefined;
}

export async function deleteProject(id: number): Promise<boolean> {
  const affected = await db('map_projects').where({ id }).del();
  return affected > 0;
}

export async function duplicateProject(
  sourceId: number,
  newName: string,
): Promise<Project | undefined> {
  return db.transaction(async (trx) => {
    const source = await trx<ProjectRow>('map_projects').where({ id: sourceId }).first();
    if (!source) {
      return undefined;
    }

    const [created] = (await trx<ProjectRow>('map_projects')
      .insert({
        name: newName,
        description: source.description,
        grid_size: source.grid_size,
        cover_path: source.cover_path,
        status: 'draft',
        draft_data: source.draft_data,
        draft_updated_at: source.draft_data ? trx.fn.now() : null,
      })
      .returning('*')) as ProjectRow[];

    return toProject(created!);
  });
}
