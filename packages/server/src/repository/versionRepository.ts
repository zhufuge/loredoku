import { db } from '../db/knex';
import type { MapDraft, MapVersionRow, MapVersionSummary } from '@murdoku/shared';

function toSummary(row: MapVersionRow): MapVersionSummary {
  return {
    id: Number(row.id),
    versionNo: row.version_no,
    gridSize: row.grid_size,
    notes: row.notes,
    publishedAt: new Date(row.snapshot_created_at).toISOString(),
  };
}

export async function listVersions(projectId: number): Promise<MapVersionSummary[]> {
  const rows = (await db<MapVersionRow>('map_versions')
    .where({ project_id: projectId })
    .orderBy('version_no', 'desc')
    .select('*')) as MapVersionRow[];
  return rows.map(toSummary);
}

export async function getVersion(
  projectId: number,
  versionNo: number,
): Promise<MapVersionRow | undefined> {
  return db<MapVersionRow>('map_versions').where({ project_id: projectId, version_no: versionNo }).first();
}

export async function countVersions(projectId: number): Promise<number> {
  const row = await db('map_versions').where({ project_id: projectId }).count('id as count').first();
  return Number((row as { count?: string | number } | undefined)?.count ?? 0);
}

export async function nextVersionNo(projectId: number): Promise<number> {
  const row = await db('map_versions')
    .where({ project_id: projectId })
    .max('version_no as max')
    .first();
  const max = Number((row as { max?: string | number | null } | undefined)?.max ?? 0);
  return max + 1;
}

export interface CreateVersionData {
  projectId: number;
  versionNo: number;
  gridSize: number;
  data: MapDraft;
  notes: string | null;
}

export async function createVersion(data: CreateVersionData): Promise<MapVersionSummary> {
  return db.transaction(async (trx) => {
    const [row] = (await trx('map_versions')
      .insert({
        project_id: data.projectId,
        version_no: data.versionNo,
        grid_size: data.gridSize,
        data: data.data,
        notes: data.notes,
      })
      .returning('*')) as MapVersionRow[];

    await trx('map_projects')
      .where({ id: data.projectId })
      .update({
        current_version_no: data.versionNo,
        status: 'published',
        updated_at: trx.fn.now(),
      });

    return toSummary(row!);
  });
}
