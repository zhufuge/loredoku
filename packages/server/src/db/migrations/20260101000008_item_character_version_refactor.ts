import type { Knex } from 'knex';
import { DEFAULT_ITEM_CATEGORY, DEFAULT_PROJECT_STATUS, MAP_JSON_VERSION } from '@loredoku/shared';

interface ProjectRow {
  id: string | number;
  grid_size: number;
}

interface ItemRow {
  id: string | number;
  width_cells: number;
  height_cells: number;
}

interface LegacyCell {
  project_id: string | number;
  x: number;
  y: number;
  card_id: string | number | null;
}

interface RegionRow {
  id: string | number;
  project_id: string | number;
  name: string;
  color: string;
  border_width: number;
  fill_opacity: string | number;
}

interface RegionCellRow {
  region_id: string | number;
  x: number;
  y: number;
}

function buildDraft(
  project: ProjectRow,
  cells: LegacyCell[],
  regions: RegionRow[],
  regionCells: RegionCellRow[],
  sizeByItem: Map<number, { w: number; h: number }>,
): Record<string, unknown> {
  const cellsJson: Record<string, unknown> = {};
  for (const cell of cells) {
    if (cell.card_id === null) {
      continue;
    }
    const itemId = Number(cell.card_id);
    const size = sizeByItem.get(itemId) ?? { w: 1, h: 1 };
    cellsJson[`${cell.x},${cell.y}`] = { object: { itemId, w: size.w, h: size.h } };
  }

  const cellsByRegion = new Map<number, Array<[number, number]>>();
  for (const rc of regionCells) {
    const regionId = Number(rc.region_id);
    const list = cellsByRegion.get(regionId);
    if (list) {
      list.push([rc.x, rc.y]);
    } else {
      cellsByRegion.set(regionId, [[rc.x, rc.y]]);
    }
  }

  const regionsJson = regions.map((region) => {
    const regionCoordList = cellsByRegion.get(Number(region.id)) ?? [];
    return {
      id: `rg_${Number(region.id)}`,
      name: region.name,
      color: region.color,
      borderWidth: region.border_width,
      fillOpacity: Number(region.fill_opacity),
      cells: regionCoordList,
      labelCell: regionCoordList[0] ?? null,
    };
  });

  return {
    version: MAP_JSON_VERSION,
    gridSize: project.grid_size,
    cells: cellsJson,
    regions: regionsJson,
    characterSlots: [],
    placedCharacters: [],
  };
}

export async function up(knex: Knex): Promise<void> {
  const dryRun = process.env.MIGRATION_DRY_RUN === 'true';

  await knex.transaction(async (trx) => {
    await trx.schema.renameTable('cards', 'items');
    await trx.schema.renameTable('card_triggers', 'item_triggers');

    await trx.schema.alterTable('item_triggers', (table) => {
      table.renameColumn('card_id', 'item_id');
    });

    await trx.schema.alterTable('items', (table) => {
      table.string('category', 16).notNullable().defaultTo(DEFAULT_ITEM_CATEGORY);
      table.integer('width_cells').notNullable().defaultTo(1);
      table.integer('height_cells').notNullable().defaultTo(1);
      table.boolean('can_stand').notNullable().defaultTo(true);
    });

    await trx.schema.createTable('characters', (table) => {
      table.bigIncrements('id').primary();
      table.string('code', 64).notNullable().unique();
      table.string('name', 100).notNullable();
      table.text('description');
      table.text('avatar_path');
      table.string('avatar_mime', 64);
      table.integer('avatar_size');
      table.integer('avatar_width');
      table.integer('avatar_height');
      table.jsonb('meta').notNullable().defaultTo(trx.raw(`'{}'::jsonb`));
      table.boolean('is_active').notNullable().defaultTo(true);
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(trx.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(trx.fn.now());
    });

    await trx.schema.createTable('map_versions', (table) => {
      table.bigIncrements('id').primary();
      table
        .bigInteger('project_id')
        .notNullable()
        .references('id')
        .inTable('map_projects')
        .onDelete('CASCADE')
        .onUpdate('CASCADE');
      table.integer('version_no').notNullable();
      table.integer('grid_size').notNullable();
      table.jsonb('data').notNullable();
      table.string('notes', 200);
      table.timestamp('snapshot_created_at', { useTz: true }).notNullable().defaultTo(trx.fn.now());
      table.unique(['project_id', 'version_no'], { indexName: 'uq_map_versions_project_no' });
    });

    await trx.schema.alterTable('map_projects', (table) => {
      table.string('status', 16).notNullable().defaultTo(DEFAULT_PROJECT_STATUS);
      table.integer('current_version_no');
      table.jsonb('draft_data');
      table.timestamp('draft_updated_at', { useTz: true });
    });

    // ---- Fold legacy per-cell rows into a single JSONB draft per project ----
    const projects = (await trx('map_projects').select('id', 'grid_size')) as ProjectRow[];
    const allCells = (await trx('map_cells').select(
      'project_id',
      'x',
      'y',
      'card_id',
    )) as LegacyCell[];
    const allRegions = (await trx('map_regions').select(
      'id',
      'project_id',
      'name',
      'color',
      'border_width',
      'fill_opacity',
    )) as RegionRow[];
    const allRegionCells = (await trx('map_region_cells').select(
      'region_id',
      'x',
      'y',
    )) as RegionCellRow[];
    const allItems = (await trx('items').select('id', 'width_cells', 'height_cells')) as ItemRow[];

    const sizeByItem = new Map<number, { w: number; h: number }>();
    for (const item of allItems) {
      sizeByItem.set(Number(item.id), { w: item.width_cells, h: item.height_cells });
    }

    const cellsByProject = new Map<number, LegacyCell[]>();
    for (const cell of allCells) {
      const pid = Number(cell.project_id);
      const list = cellsByProject.get(pid);
      if (list) list.push(cell);
      else cellsByProject.set(pid, [cell]);
    }
    const regionsByProject = new Map<number, RegionRow[]>();
    for (const region of allRegions) {
      const pid = Number(region.project_id);
      const list = regionsByProject.get(pid);
      if (list) list.push(region);
      else regionsByProject.set(pid, [region]);
    }

    for (const project of projects) {
      const pid = Number(project.id);
      const draft = buildDraft(
        project,
        cellsByProject.get(pid) ?? [],
        regionsByProject.get(pid) ?? [],
        allRegionCells,
        sizeByItem,
      );
      if (dryRun) {
        // eslint-disable-next-line no-console
        console.log(`[dry-run] project ${pid} draft:`, JSON.stringify(draft));
      } else {
        await trx('map_projects')
          .where({ id: pid })
          .update({ draft_data: draft, draft_updated_at: trx.fn.now() });
      }
    }

    if (dryRun) {
      throw new Error('MIGRATION_DRY_RUN: rolling back after fold preview');
    }

    // ---- Drop legacy tables + rename legacy indexes ----
    await trx.schema.dropTableIfExists('map_region_cells');
    await trx.schema.dropTableIfExists('map_regions');
    await trx.schema.dropTableIfExists('map_cells');

    await trx.raw('ALTER INDEX IF EXISTS idx_cards_meta RENAME TO idx_items_meta');
    await trx.raw('ALTER INDEX IF EXISTS idx_triggers_card RENAME TO idx_item_triggers_item');
    await trx.raw('ALTER INDEX IF EXISTS idx_triggers_kv RENAME TO idx_item_triggers_kv');
    await trx.raw('CREATE INDEX IF NOT EXISTS idx_items_category ON items(category)');
    await trx.raw('CREATE INDEX IF NOT EXISTS idx_items_meta ON items USING GIN (meta)');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('map_versions');
  await knex.schema.dropTableIfExists('characters');

  await knex.schema.alterTable('map_projects', (table) => {
    table.dropColumn('status');
    table.dropColumn('current_version_no');
    table.dropColumn('draft_data');
    table.dropColumn('draft_updated_at');
  });

  await knex.schema.alterTable('items', (table) => {
    table.dropColumn('category');
    table.dropColumn('width_cells');
    table.dropColumn('height_cells');
    table.dropColumn('can_stand');
  });

  await knex.schema.alterTable('item_triggers', (table) => {
    table.renameColumn('item_id', 'card_id');
  });
  await knex.schema.renameTable('item_triggers', 'card_triggers');
  await knex.schema.renameTable('items', 'cards');
}
