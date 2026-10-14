import { db } from '../db/knex';
import type {
  CardRotation,
  CellCoord,
  MapCell,
  MapCellInput,
  MapCellRow,
  MapData,
  MapRegionCellRow,
  MapRegionRow,
  RegionData,
  RegionInput,
  SaveMapInput,
} from '@murdoku/shared';

export type MapCellsAndRegions = Pick<MapData, 'cells' | 'regions'>;

function toMapCell(row: MapCellRow): MapCell {
  return {
    x: row.x,
    y: row.y,
    cardId: Number(row.card_id),
    rotation: row.rotation,
    zIndex: row.z_index,
  };
}

function toRegion(row: MapRegionRow, cells: CellCoord[]): RegionData {
  return {
    id: Number(row.id),
    name: row.name,
    description: row.description,
    color: row.color,
    borderWidth: row.border_width,
    fillOpacity: Number(row.fill_opacity),
    cells,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function getMapData(projectId: number): Promise<MapCellsAndRegions> {
  const [cellRows, regionRows] = await Promise.all([
    db<MapCellRow>('map_cells').where({ project_id: projectId }).whereNotNull('card_id').select('*'),
    db<MapRegionRow>('map_regions').where({ project_id: projectId }).select('*'),
  ]);

  const regionIds = regionRows.map((row) => Number(row.id));
  const cellsByRegion = new Map<number, CellCoord[]>();
  if (regionIds.length > 0) {
    const regionCells = (await db<MapRegionCellRow>('map_region_cells')
      .whereIn('region_id', regionIds)
      .select('*')) as MapRegionCellRow[];
    for (const cell of regionCells) {
      const key = Number(cell.region_id);
      const list = cellsByRegion.get(key) ?? [];
      list.push({ x: cell.x, y: cell.y });
      cellsByRegion.set(key, list);
    }
  }

  return {
    cells: cellRows.map(toMapCell),
    regions: regionRows.map((row) => toRegion(row, cellsByRegion.get(Number(row.id)) ?? [])),
  };
}

export async function replaceMap(projectId: number, input: SaveMapInput): Promise<MapCellsAndRegions> {
  return db.transaction(async (trx) => {
    await trx('map_cells').where({ project_id: projectId }).del();
    await trx('map_regions').where({ project_id: projectId }).del();

    if (input.cells.length > 0) {
      await trx('map_cells').insert(
        input.cells.map((cell) => ({
          project_id: projectId,
          x: cell.x,
          y: cell.y,
          card_id: cell.cardId,
          rotation: cell.rotation,
          z_index: cell.zIndex,
        })),
      );
    }

    const regions: RegionData[] = [];
    for (const region of input.regions) {
      const [inserted] = await trx<MapRegionRow>('map_regions')
        .insert({
          project_id: projectId,
          name: region.name,
          description: region.description ?? null,
          color: region.color,
          border_width: region.borderWidth,
          fill_opacity: region.fillOpacity,
        })
        .returning('*');
      const row = inserted!;
      if (region.cells.length > 0) {
        await trx.batchInsert(
          'map_region_cells',
          region.cells.map((cell) => ({ region_id: row.id, x: cell.x, y: cell.y })),
        );
      }
      regions.push(toRegion(row, region.cells.map((cell) => ({ x: cell.x, y: cell.y }))));
    }

    await trx('map_projects').where({ id: projectId }).update({ updated_at: trx.fn.now() });

    return {
      cells: input.cells.map((cell) => ({
        x: cell.x,
        y: cell.y,
        cardId: cell.cardId,
        rotation: cell.rotation as CardRotation,
        zIndex: cell.zIndex,
      })),
      regions,
    };
  });
}

export async function existingCardIds(ids: number[]): Promise<Set<number>> {
  if (ids.length === 0) return new Set();
  const rows = (await db('cards').whereIn('id', ids).select('id')) as Array<{ id: number | string }>;
  return new Set(rows.map((row) => Number(row.id)));
}

// ---- Single-region operations (POST/PATCH/DELETE /regions) ----

export async function listRegions(projectId: number): Promise<RegionData[]> {
  const data = await getMapData(projectId);
  return data.regions;
}

export async function findRegion(regionId: number): Promise<MapRegionRow | undefined> {
  return db<MapRegionRow>('map_regions').where({ id: regionId }).first();
}

export async function regionCellOwners(
  projectId: number,
  excludeRegionId?: number,
): Promise<Map<string, number>> {
  const rows = (await db('map_region_cells')
    .join('map_regions', 'map_regions.id', 'map_region_cells.region_id')
    .where('map_regions.project_id', projectId)
    .modify((query) => {
      if (excludeRegionId !== undefined) {
        query.whereNot('map_regions.id', excludeRegionId);
      }
    })
    .select('map_region_cells.x', 'map_region_cells.y', 'map_regions.id')) as Array<{
    x: number;
    y: number;
    id: number | string;
  }>;
  const owners = new Map<string, number>();
  for (const row of rows) {
    owners.set(`${row.x},${row.y}`, Number(row.id));
  }
  return owners;
}

export async function createRegion(projectId: number, input: RegionInput): Promise<RegionData> {
  return db.transaction(async (trx) => {
    const [inserted] = await trx<MapRegionRow>('map_regions')
      .insert({
        project_id: projectId,
        name: input.name,
        description: input.description ?? null,
        color: input.color,
        border_width: input.borderWidth,
        fill_opacity: input.fillOpacity,
      })
      .returning('*');
    const row = inserted!;
    if (input.cells.length > 0) {
      await trx.batchInsert(
        'map_region_cells',
        input.cells.map((cell) => ({ region_id: row.id, x: cell.x, y: cell.y })),
      );
    }
    return toRegion(row, input.cells.map((cell) => ({ x: cell.x, y: cell.y })));
  });
}

export interface RegionPatch {
  name?: string;
  description?: string | null;
  color?: string;
  borderWidth?: number;
  fillOpacity?: number;
  cells?: CellCoord[];
}

export async function updateRegion(regionId: number, patch: RegionPatch): Promise<RegionData | undefined> {
  return db.transaction(async (trx) => {
    const fields: Record<string, unknown> = { updated_at: trx.fn.now() };
    if (patch.name !== undefined) fields.name = patch.name;
    if (patch.description !== undefined) fields.description = patch.description;
    if (patch.color !== undefined) fields.color = patch.color;
    if (patch.borderWidth !== undefined) fields.border_width = patch.borderWidth;
    if (patch.fillOpacity !== undefined) fields.fill_opacity = patch.fillOpacity;

    const [row] = await trx<MapRegionRow>('map_regions')
      .where({ id: regionId })
      .update(fields)
      .returning('*');
    if (!row) return undefined;

    if (patch.cells !== undefined) {
      await trx('map_region_cells').where({ region_id: regionId }).del();
      if (patch.cells.length > 0) {
        await trx.batchInsert(
          'map_region_cells',
          patch.cells.map((cell) => ({ region_id: regionId, x: cell.x, y: cell.y })),
        );
      }
    }

    const cells =
      patch.cells ??
      ((await trx<MapRegionCellRow>('map_region_cells')
        .where({ region_id: regionId })
        .select('x', 'y')) as MapRegionCellRow[]).map((cell) => ({ x: cell.x, y: cell.y }));

    return toRegion(row, cells);
  });
}

export async function deleteRegion(regionId: number): Promise<boolean> {
  const affected = await db('map_regions').where({ id: regionId }).del();
  return affected > 0;
}

export type { MapCellInput };
