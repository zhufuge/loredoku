import type { Knex } from 'knex';

/**
 * v0.5.8 地图版本管理优化专项 —— 数据库侧（docs/v0.5.8.md §6）
 *
 * 三件事，顺序即依赖：
 *
 * 1. **`map_projects` → `maps`，并删除 `grid_size`**。画布尺寸从此只活在
 *    `draft_data.gridSize` 里（「放到 data 中」），创建地图时不再填写，改由
 *    编辑器首次进入时的初始化弹窗写入。
 * 2. **`map_versions` 删除 `grid_size` 与 `notes`**。版本快照 `data` 自带
 *    `gridSize`；发布弹窗的去备注化让 `notes` 再无写入方。
 * 3. **`map_games` → `games`**。谜题才是部署单位，表名跟着改名。
 *
 * PG 的 `ALTER TABLE ... RENAME TO` **不会**重命名索引、约束与序列 ——
 * `map_projects_root_id_index` / `map_projects_id_seq` 之类会原样留着，
 * 与 v0.2.0 `cards → items` 时 `cards_id_seq` 的遗留同源。功能不受影响，
 * 故不做额外重命名（多一条 raw SQL 就多一个可失败点）。
 */
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
