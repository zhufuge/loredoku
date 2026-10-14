import { db } from '../db/knex';
import type { MapDraft, MapVersionRow, MapVersionSummary } from '@murdoku/shared';

/** FEAT-503: the works panel shows participant / region / item totals. */
function summarizeData(data: MapDraft | null | undefined): {
  participantCount: number;
  regionCount: number;
  itemCount: number;
} {
  const draft = data ?? null;
  const itemIds = new Set<number>();
  for (const cell of Object.values(draft?.cells ?? {})) {
    if (cell?.object) itemIds.add(cell.object.itemId);
    if (cell?.background) itemIds.add(cell.background.itemId);
  }
  return {
    participantCount: draft?.placedCharacters?.length ?? 0,
    regionCount: draft?.regions?.length ?? 0,
    itemCount: itemIds.size,
  };
}

function toSummary(row: MapVersionRow): MapVersionSummary {
  return {
    id: Number(row.id),
    versionNo: row.version_no,
    gridSize: row.grid_size,
    notes: row.notes,
    publishedAt: new Date(row.snapshot_created_at).toISOString(),
    ...summarizeData(row.data),
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

/** FEAT-503: delete a published work and keep the project pointer in sync. */
export async function deleteVersion(projectId: number, versionNo: number): Promise<boolean> {
  return db.transaction(async (trx) => {
    const affected = await trx('map_versions')
      .where({ project_id: projectId, version_no: versionNo })
      .del();
    if (affected === 0) return false;

    const remaining = await trx('map_versions')
      .where({ project_id: projectId })
      .max('version_no as max')
      .first();
    const max = Number((remaining as { max?: string | number | null } | undefined)?.max ?? 0);
    await trx('map_projects').where({ id: projectId }).update({
      current_version_no: max > 0 ? max : null,
      status: max > 0 ? 'published' : 'draft',
      updated_at: trx.fn.now(),
    });
    return true;
  });
}
