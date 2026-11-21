import type { Knex } from 'knex';

/** v0.5.8 版本管理专项（docs/v0.5.8.md §6）：map_projects→maps 并删 grid_size（尺寸只留在 draft_data.gridSize）、map_versions 删 grid_size/notes、map_games→games；PG 的 RENAME TO 不改索引/约束/序列名，功能不受影响故不额外重命名。 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.renameTable('map_projects', 'maps');

  // 列删除会连带删掉 v0.2.3 加的 `map_projects_grid_size_check`。
  await knex.schema.alterTable('maps', (table) => {
    table.dropColumn('grid_size');
  });

  await knex.schema.alterTable('map_versions', (table) => {
    table.dropColumn('grid_size');
    table.dropColumn('notes');
  });

  await knex.schema.renameTable('map_games', 'games');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.renameTable('games', 'map_games');

  await knex.schema.alterTable('map_versions', (table) => {
    table.string('notes', 200);
  });
  await knex.raw('ALTER TABLE map_versions ADD COLUMN grid_size integer');
  await knex.raw(
    `UPDATE map_versions SET grid_size = COALESCE((data->>'gridSize')::int, 8)`,
  );
  await knex.raw('ALTER TABLE map_versions ALTER COLUMN grid_size SET NOT NULL');

  await knex.raw('ALTER TABLE maps ADD COLUMN grid_size integer');
  await knex.raw(
    `UPDATE maps SET grid_size = COALESCE((draft_data->>'gridSize')::int, 8)`,
  );
  await knex.raw('ALTER TABLE maps ALTER COLUMN grid_size SET NOT NULL');
  await knex.raw(
    'ALTER TABLE maps ADD CONSTRAINT map_projects_grid_size_check CHECK (grid_size >= 3 AND grid_size <= 24)',
  );
  await knex.schema.renameTable('maps', 'map_projects');
}
