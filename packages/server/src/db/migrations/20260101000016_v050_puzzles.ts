import type { Knex } from 'knex';
import {
  DEFAULT_MAP_STATUS,
  GRID_SIZE_MAX,
  GRID_SIZE_MIN,
  PUZZLE_NAME_MAX_LENGTH,
} from '@loredoku/shared';
import {
  buildPuzzleSeedFromMap,
  slotsFromLegacyDraft,
  type PuzzleSeedMap,
} from '../../service/puzzleBackfill';

/**
 * v0.5.0 (docs/v0.5.0.md §11.1 / §11.2) — the puzzle module and the blood
 * lineage.
 *
 * Two changes, in one migration because they both belong to "v0.5.0 introduces
 * the puzzle":
 *
 * 1. `map_projects.root_id` (Q3 = B). A map forked from a published version
 *    keeps the original's root, so the list groups them together and the
 *    version numbering continues instead of restarting at v1. Existing rows
 *    backfill `root_id = id`, which is exactly the old behaviour.
 * 2. The `puzzles` table, plus a **one-off backfill**: every map whose highest
 *    published version carried a roster gets a puzzle holding it, so the
 *    participants the author already wrote stay visible.
 *
 * The backfill deliberately does **not** rewrite `map_projects.draft_data` or
 * `map_versions.data` — the old JSON is left exactly as it was, and the reader
 * absorbs it (`service/mapDraftCompat.ts`). That is what keeps `down()`
 * lossless.
 */
export async function up(knex: Knex): Promise<void> {
  // ---- 1) map_projects.root_id ----
  await knex.schema.alterTable('map_projects', (table) => {
    table.bigInteger('root_id');
  });
  await knex.raw('UPDATE map_projects SET root_id = id WHERE root_id IS NULL');
  await knex.raw('ALTER TABLE map_projects ALTER COLUMN root_id SET NOT NULL');
  await knex.schema.alterTable('map_projects', (table) => {
    table.index(['root_id'], 'map_projects_root_id_index');
  });

  // ---- 2) puzzles ----
  await knex.schema.createTable('puzzles', (table) => {
    table.bigIncrements('id').primary();
    table.string('name', PUZZLE_NAME_MAX_LENGTH).notNullable();
    table.text('description');
    table
      .bigInteger('map_project_id')
      .notNullable()
      .references('id')
      .inTable('map_projects')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE');
    table.integer('map_version_no').notNullable();
    table.integer('grid_size').notNullable();
    table.jsonb('data').notNullable();
    table.string('status', 16).notNullable().defaultTo(DEFAULT_MAP_STATUS);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.check(`grid_size >= ${GRID_SIZE_MIN} AND grid_size <= ${GRID_SIZE_MAX}`);
    table.check('map_version_no >= 1');
  });
  await knex.schema.alterTable('puzzles', (table) => {
    table.index(['map_project_id', 'map_version_no'], 'puzzles_map_version_index');
  });

  // ---- 3) move the stored rosters into puzzles ----
  const projects = (await knex('map_projects').select(
    'id',
    'name',
    'description',
    'grid_size',
  )) as PuzzleSeedMap[];

  for (const project of projects) {
    const version = (await knex('map_versions')
      .where({ project_id: project.id })
      .orderBy('version_no', 'desc')
      .first()) as
      | { version_no: number; grid_size: number; data: unknown }
      | undefined;
    // A puzzle must reference a published version — without one there is no
    // canvas to draw on, so the roster stays in the old JSON untouched.
    if (!version) continue;

    const gridSize = version.grid_size;
    const roster = slotsFromLegacyDraft(version.data, gridSize);
    // Only maps that actually carried participants get a puzzle; otherwise the
    // new module would fill up with empty shells for every published map.
    if (!roster.some((slot) => slot !== null)) continue;

    const seed = buildPuzzleSeedFromMap(
      project,
      { versionNo: version.version_no, gridSize, data: version.data },
      project.name,
    );
    if (!seed) continue;

    // Idempotent: re-running the migration (after a rollback) inserts nothing.
    const existing = await knex('puzzles')
      .where({
        map_project_id: project.id,
        map_version_no: version.version_no,
        name: project.name,
      })
      .first();
    if (existing) continue;

    await knex('puzzles').insert({
      name: project.name,
      description: project.description,
      map_project_id: project.id,
      map_version_no: version.version_no,
      grid_size: gridSize,
      data: seed,
      status: DEFAULT_MAP_STATUS,
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('puzzles');
  await knex.schema.alterTable('map_projects', (table) => {
    table.dropIndex(['root_id'], 'map_projects_root_id_index');
    table.dropColumn('root_id');
  });
}
