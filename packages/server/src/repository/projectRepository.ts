import { db } from '../db/knex';
import { buildFileUrl } from '../utils/paths';
import type { Project, ProjectDetail, ProjectRow } from '@murdoku/shared';

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
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
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

  const rows = await query
    .clone()
    .orderBy(SORT_COLUMNS[params.sort], params.order)
    .limit(params.pageSize)
    .offset((params.page - 1) * params.pageSize)
    .select('*');

  const ids = rows.map((row) => Number(row.id));
  const cardCounts = new Map<number, number>();
  const regionCounts = new Map<number, number>();

  if (ids.length > 0) {
    const cellCounts = (await db('map_cells')
      .whereIn('project_id', ids)
      .whereNotNull('card_id')
      .groupBy('project_id')
      .select('project_id')
      .count('id as count')) as Array<{ project_id: number | string; count: string | number }>;
    for (const row of cellCounts) {
      cardCounts.set(Number(row.project_id), Number(row.count));
    }

    const regionCountRows = (await db('map_regions')
      .whereIn('project_id', ids)
      .groupBy('project_id')
      .select('project_id')
      .count('id as count')) as Array<{ project_id: number | string; count: string | number }>;
    for (const row of regionCountRows) {
      regionCounts.set(Number(row.project_id), Number(row.count));
    }
  }

  const list = rows.map((row) => {
    const id = Number(row.id);
    return {
      ...toProject(row),
      cardCount: cardCounts.get(id) ?? 0,
      regionCount: regionCounts.get(id) ?? 0,
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
    query.whereNot({ id: excludeId });
  }
  const row = await query.first('id');
  return Boolean(row);
}

export async function getProjectCounts(
  id: number,
): Promise<{ cardCount: number; regionCount: number }> {
  const [cellRow, regionRow] = await Promise.all([
    db('map_cells').where({ project_id: id }).whereNotNull('card_id').count('id as count').first(),
    db('map_regions').where({ project_id: id }).count('id as count').first(),
  ]);
  return {
    cardCount: Number((cellRow as CountRow)?.count ?? 0),
    regionCount: Number((regionRow as CountRow)?.count ?? 0),
  };
}

export async function createProject(data: CreateProjectData): Promise<Project> {
  const [row] = await db<ProjectRow>('map_projects')
    .insert({
      name: data.name,
      description: data.description,
      grid_size: data.gridSize,
    })
    .returning('*');
  return toProject(row!);
}

export async function updateProject(
  id: number,
  data: UpdateProjectData,
): Promise<Project | undefined> {
  const patch: Record<string, unknown> = { updated_at: db.fn.now() };
  if (data.name !== undefined) patch.name = data.name;
  if (data.description !== undefined) patch.description = data.description;

  const [row] = await db<ProjectRow>('map_projects').where({ id }).update(patch).returning('*');
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

    const [created] = await trx<ProjectRow>('map_projects')
      .insert({
        name: newName,
        description: source.description,
        grid_size: source.grid_size,
        cover_path: source.cover_path,
      })
      .returning('*');
    const project = created!;

    const cells = await trx('map_cells')
      .where({ project_id: sourceId })
      .select('x', 'y', 'card_id', 'rotation', 'z_index');
    if (cells.length > 0) {
      await trx('map_cells').insert(
        cells.map((cell: Record<string, unknown>) => ({
          project_id: project.id,
          x: cell.x,
          y: cell.y,
          card_id: cell.card_id,
          rotation: cell.rotation,
          z_index: cell.z_index,
        })),
      );
    }

    const regions = await trx('map_regions').where({ project_id: sourceId }).select('*');
    for (const region of regions as Array<Record<string, unknown>>) {
      const [newRegion] = await trx('map_regions')
        .insert({
          project_id: project.id,
          name: region.name,
          description: region.description,
          color: region.color,
          border_width: region.border_width,
          fill_opacity: region.fill_opacity,
          meta: region.meta,
        })
        .returning('id');
      const regionCells = await trx('map_region_cells')
        .where({ region_id: region.id as number })
        .select('x', 'y');
      if (regionCells.length > 0) {
        await trx('map_region_cells').insert(
          regionCells.map((cell: Record<string, unknown>) => ({
            region_id: (newRegion as { id: number }).id,
            x: cell.x,
            y: cell.y,
          })),
        );
      }
    }

    return toProject(project);
  });
}
