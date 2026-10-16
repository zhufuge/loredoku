import { db } from '../db/knex';
import type { MapDraft, MapVersionRow, MapVersionSummary } from '@loredoku/shared';
import { absorbLegacyMapDraft, readLegacyCharacterSlots } from '../service/mapDraftCompat';

/**
 * v0.5.0 (docs/v0.5.0.md §7 / §8.3): `map_versions` keeps its meaning — one row
 * per publish — and its old "works" semantics are gone. Every read goes through
 * `absorbLegacyMapDraft`, because rows published before v0.5.0 still carry the
 * roster and the palette inside their JSON.
 */

/** FEAT-503: the version panel shows participant / region / item totals. */
function summarizeData(raw: unknown): {
  participantCount: number;
  regionCount: number;
  itemCount: number;
} {
  const draft = (absorbLegacyMapDraft(raw) ?? null) as MapDraft | null;
  const itemIds = new Set<number>();
  for (const cell of Object.values(draft?.cells ?? {})) {
    if (cell?.object) itemIds.add(cell.object.itemId);
    if (cell?.background) itemIds.add(cell.background.itemId);
  }
  // v0.5.0: participants live on puzzles, so this counts only legacy snapshots.
  const participantCount = readLegacyCharacterSlots(raw).filter((slot) => slot !== null).length;
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

/** Exported so the service can map lineage rows without duplicating the counts. */
export const toVersionSummary = toSummary;

export async function listVersions(projectId: number): Promise<MapVersionSummary[]> {
  const rows = (await db<MapVersionRow>('map_versions')
    .where({ project_id: projectId })
    .orderBy('version_no', 'desc')
    .select('*')) as MapVersionRow[];
  return rows.map(toSummary);
}

/**
 * Q3 = B (docs/v0.5.0.md §7.1): the version history lists the **whole blood
 * lineage**, not just one `map_projects` row — a map forked from a published
 * version shares the original's `root_id`, and its own publishes belong to the
 * same list.
 */
export async function listVersionsForRoot(
  rootId: number,
): Promise<Array<MapVersionRow & { project_name: string | null }>> {
  return (await db('map_versions as v')
    .join('map_projects as p', 'p.id', 'v.project_id')
    .where('p.root_id', rootId)
    .select('v.*', 'p.name as project_name')
    .orderBy('v.version_no', 'desc')) as Array<MapVersionRow & { project_name: string | null }>;
}

/**
 * OPT-G01 (docs/v0.4.0.md §2): the version detail carries the map name too, so
 * the preview page can title itself with it (version as a badge).
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

/** Every version row belonging to one lineage, keyed by its owner project id. */
export async function listLineageVersions(
  rootId: number,
): Promise<Array<{ project_id: number; version_no: number; snapshot_created_at: Date | string }>> {
  const rows = (await db('map_versions as v')
    .join('map_projects as p', 'p.id', 'v.project_id')
    .where('p.root_id', rootId)
    .select('v.project_id', 'v.version_no', 'v.snapshot_created_at')
    .orderBy('v.version_no', 'desc')) as Array<{
    project_id: string | number;
    version_no: number;
    snapshot_created_at: Date | string;
  }>;
  return rows.map((row) => ({
    project_id: Number(row.project_id),
    version_no: row.version_no,
    snapshot_created_at: row.snapshot_created_at,
  }));
}

/**
 * SPEC-K11 + Q3 = B: the next version number of the **whole lineage**. Without
 * this, a map forked from `v3` would publish its first revision as `v1`.
 */
export async function nextVersionNo(rootId: number): Promise<number> {
  const row = await db('map_versions as v')
    .join('map_projects as p', 'p.id', 'v.project_id')
    .where('p.root_id', rootId)
    .max('v.version_no as max')
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

/** FEAT-503: delete one published version and keep the owner's pointer in sync. */
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
