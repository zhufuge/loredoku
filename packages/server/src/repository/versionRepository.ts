import { db } from '../db/knex';
import type { MapDraft, MapVersionRow, MapVersionSummary, WorkSummary } from '@loredoku/shared';

/**
 * OPT-W02 (docs/v0.4.1.md §2): a deployed game pins one map **and one version
 * number**, so the works table flags only that version's row — as
 * `"projectId:versionNo"` keys.
 */
async function deployedVersionKeys(): Promise<Set<string>> {
  const rows = (await db('map_games').select('project_id', 'version_no')) as Array<{
    project_id: number | string;
    version_no: number;
  }>;
  return new Set(rows.map((row) => `${Number(row.project_id)}:${row.version_no}`));
}

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
  // CLAR-603: participants live in the roster; count non-null slots.
  const participantCount = (draft?.characterSlots ?? []).filter(
    (slot) => slot !== null,
  ).length;
  return {
    participantCount,
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

/**
 * OPT-905 §5.3: every published work across all maps, newest first. The
 * project name is joined in because the works table shows 地图名称.
 *
 * FEAT-G02 (docs/v0.4.0.md §5.1) + OPT-W02 (docs/v0.4.1.md §2): `deployed`
 * marks the row whose **map + version** was deployed, so the table can badge it
 * without a second request and a stale version never keeps the badge.
 */
export async function listAllVersions(): Promise<WorkSummary[]> {
  const rows = (await db('map_versions as v')
    .join('map_projects as p', 'p.id', 'v.project_id')
    .select('v.*', 'p.name as project_name')
    .orderBy('v.snapshot_created_at', 'desc')) as Array<
    MapVersionRow & { project_name: string | null }
  >;
  const deployed = await deployedVersionKeys();
  return rows.map((row) => ({
    ...toSummary(row),
    projectId: Number(row.project_id),
    projectName: row.project_name ?? '',
    deployed: deployed.has(`${Number(row.project_id)}:${row.version_no}`),
  }));
}

/**
 * OPT-G01 (docs/v0.4.0.md §2): the version detail carries the map name too,
 * so the preview page can title itself with it (version as a badge).
 */
export async function getVersion(
  projectId: number,
  versionNo: number,
): Promise<(MapVersionRow & { project_name: string | null }) | undefined> {
  const row = await db('map_versions as v')
    .join('map_projects as p', 'p.id', 'v.project_id')
    .where({ 'v.project_id': projectId, 'v.version_no': versionNo })
    .select('v.*', 'p.name as project_name')
    .first();
  return row as (MapVersionRow & { project_name: string | null }) | undefined;
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
