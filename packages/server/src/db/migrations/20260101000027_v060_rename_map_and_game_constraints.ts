import type { Knex } from 'knex';

/**
 * v0.6.0 —— 补齐 `maps` / `games` 表改名遗漏的 PG 隐式命名对象。
 *
 * v0.5.8（迁移 `…00020`）把 `map_projects` -> `maps`、`map_games` -> `games`，
 * 但 `RENAME TABLE` 不跟着改由表派生 / 显式命名的约束、索引与自增序列，于是这两张
 * 表上至今仍残留 `map_projects_*` / `map_games_*` 前缀。与 `assets` 表的收口
 * （迁移 `…00026`）同源，这里把前缀统一换成 `maps_` / `games_`。
 *
 * 列名本身（如 `games.project_id`、`maps.root_id`）不在本次范围内 —— 那是 API / 代码
 * 层面的命名，改动面远大于「约束名对齐」。此处只把表名前缀残留收口。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    // —— games：map_games_* -> games_* ——
    await trx.raw('ALTER TABLE games RENAME CONSTRAINT map_games_pkey TO games_pkey');
    await trx.raw('ALTER TABLE games RENAME CONSTRAINT map_games_slug_unique TO games_slug_unique');
    await trx.raw('ALTER TABLE games RENAME CONSTRAINT map_games_difficulty_check TO games_difficulty_check');
    await trx.raw('ALTER TABLE games RENAME CONSTRAINT map_games_grid_size_check TO games_grid_size_check');
    await trx.raw('ALTER TABLE games RENAME CONSTRAINT map_games_project_id_foreign TO games_project_id_foreign');
    await trx.raw('ALTER TABLE games RENAME CONSTRAINT map_games_puzzle_id_foreign TO games_puzzle_id_foreign');
    await trx.raw('ALTER TABLE games RENAME CONSTRAINT map_games_id_not_null TO games_id_not_null');
    await trx.raw('ALTER TABLE games RENAME CONSTRAINT map_games_project_id_not_null TO games_project_id_not_null');
    await trx.raw('ALTER TABLE games RENAME CONSTRAINT map_games_version_no_not_null TO games_version_no_not_null');
    await trx.raw('ALTER TABLE games RENAME CONSTRAINT map_games_name_not_null TO games_name_not_null');
    await trx.raw('ALTER TABLE games RENAME CONSTRAINT map_games_grid_size_not_null TO games_grid_size_not_null');
    await trx.raw('ALTER TABLE games RENAME CONSTRAINT map_games_snapshot_not_null TO games_snapshot_not_null');
    await trx.raw('ALTER TABLE games RENAME CONSTRAINT map_games_slug_not_null TO games_slug_not_null');
    await trx.raw('ALTER TABLE games RENAME CONSTRAINT map_games_difficulty_not_null TO games_difficulty_not_null');
    await trx.raw('ALTER TABLE games RENAME CONSTRAINT map_games_created_at_not_null TO games_created_at_not_null');
    await trx.raw('ALTER TABLE games RENAME CONSTRAINT map_games_updated_at_not_null TO games_updated_at_not_null');
    // `puzzle_id` 的唯一性是纯唯一索引（无约束），走 ALTER INDEX。
    await trx.raw('ALTER INDEX map_games_puzzle_id_unique RENAME TO games_puzzle_id_unique');
    await trx.raw('ALTER SEQUENCE map_games_id_seq RENAME TO games_id_seq');

    // —— maps：map_projects_* -> maps_* ——
    await trx.raw('ALTER TABLE maps RENAME CONSTRAINT map_projects_pkey TO maps_pkey');
    await trx.raw('ALTER TABLE maps RENAME CONSTRAINT map_projects_id_not_null TO maps_id_not_null');
    await trx.raw('ALTER TABLE maps RENAME CONSTRAINT map_projects_name_not_null TO maps_name_not_null');
    await trx.raw('ALTER TABLE maps RENAME CONSTRAINT map_projects_root_id_not_null TO maps_root_id_not_null');
    await trx.raw('ALTER TABLE maps RENAME CONSTRAINT map_projects_created_at_not_null TO maps_created_at_not_null');
    await trx.raw('ALTER TABLE maps RENAME CONSTRAINT map_projects_updated_at_not_null TO maps_updated_at_not_null');
    await trx.raw('ALTER INDEX map_projects_root_id_index RENAME TO maps_root_id_index');
    await trx.raw('ALTER SEQUENCE map_projects_id_seq RENAME TO maps_id_seq');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    // —— maps ——
    await trx.raw('ALTER SEQUENCE maps_id_seq RENAME TO map_projects_id_seq');
    await trx.raw('ALTER INDEX maps_root_id_index RENAME TO map_projects_root_id_index');
    await trx.raw('ALTER TABLE maps RENAME CONSTRAINT maps_updated_at_not_null TO map_projects_updated_at_not_null');
    await trx.raw('ALTER TABLE maps RENAME CONSTRAINT maps_created_at_not_null TO map_projects_created_at_not_null');
    await trx.raw('ALTER TABLE maps RENAME CONSTRAINT maps_root_id_not_null TO map_projects_root_id_not_null');
    await trx.raw('ALTER TABLE maps RENAME CONSTRAINT maps_name_not_null TO map_projects_name_not_null');
    await trx.raw('ALTER TABLE maps RENAME CONSTRAINT maps_id_not_null TO map_projects_id_not_null');
    await trx.raw('ALTER TABLE maps RENAME CONSTRAINT maps_pkey TO map_projects_pkey');

    // —— games ——
    await trx.raw('ALTER SEQUENCE games_id_seq RENAME TO map_games_id_seq');
    await trx.raw('ALTER INDEX games_puzzle_id_unique RENAME TO map_games_puzzle_id_unique');
    await trx.raw('ALTER TABLE games RENAME CONSTRAINT games_updated_at_not_null TO map_games_updated_at_not_null');
    await trx.raw('ALTER TABLE games RENAME CONSTRAINT games_created_at_not_null TO map_games_created_at_not_null');
    await trx.raw('ALTER TABLE games RENAME CONSTRAINT games_difficulty_not_null TO map_games_difficulty_not_null');
    await trx.raw('ALTER TABLE games RENAME CONSTRAINT games_slug_not_null TO map_games_slug_not_null');
    await trx.raw('ALTER TABLE games RENAME CONSTRAINT games_snapshot_not_null TO map_games_snapshot_not_null');
    await trx.raw('ALTER TABLE games RENAME CONSTRAINT games_grid_size_not_null TO map_games_grid_size_not_null');
    await trx.raw('ALTER TABLE games RENAME CONSTRAINT games_name_not_null TO map_games_name_not_null');
    await trx.raw('ALTER TABLE games RENAME CONSTRAINT games_version_no_not_null TO map_games_version_no_not_null');
    await trx.raw('ALTER TABLE games RENAME CONSTRAINT games_project_id_not_null TO map_games_project_id_not_null');
    await trx.raw('ALTER TABLE games RENAME CONSTRAINT games_id_not_null TO map_games_id_not_null');
    await trx.raw('ALTER TABLE games RENAME CONSTRAINT games_puzzle_id_foreign TO map_games_puzzle_id_foreign');
    await trx.raw('ALTER TABLE games RENAME CONSTRAINT games_project_id_foreign TO map_games_project_id_foreign');
    await trx.raw('ALTER TABLE games RENAME CONSTRAINT games_grid_size_check TO map_games_grid_size_check');
    await trx.raw('ALTER TABLE games RENAME CONSTRAINT games_difficulty_check TO map_games_difficulty_check');
    await trx.raw('ALTER TABLE games RENAME CONSTRAINT games_slug_unique TO map_games_slug_unique');
    await trx.raw('ALTER TABLE games RENAME CONSTRAINT games_pkey TO map_games_pkey');
  });
}
