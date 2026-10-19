import type { Knex } from 'knex';

/**
 * v0.6.0 —— 补齐资源库改名遗漏的 PG 隐式命名对象。
 *
 * `assets` 表源自 v0.2.0 的 `cards` 表，两次 `renameTable`（cards -> items ->
 * assets）都不会跟着改主键约束 / 唯一约束 / NOT NULL 约束 / 自增序列的名字，于是
 * 这些对象至今仍带着 `cards_`（建表时）或 `items_`（v0.2.0 加列时）前缀。它们
 * 只是名字残留、功能不受影响，这里统一收口成 `assets_*`，与表名对齐。
 *
 * 其中 `can_stand` / `category` 两列在 v0.6.0 已改名为 `blocking` / `type`，它们
 * 的 NOT NULL 约束名也一并按新列名收口。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    // 主键 / 唯一约束。
    await trx.raw('ALTER TABLE assets RENAME CONSTRAINT cards_pkey TO assets_pkey');
    await trx.raw('ALTER TABLE assets RENAME CONSTRAINT cards_code_unique TO assets_code_unique');
    // 建表时（cards）的 NOT NULL 约束。
    await trx.raw('ALTER TABLE assets RENAME CONSTRAINT cards_id_not_null TO assets_id_not_null');
    await trx.raw('ALTER TABLE assets RENAME CONSTRAINT cards_code_not_null TO assets_code_not_null');
    await trx.raw('ALTER TABLE assets RENAME CONSTRAINT cards_name_not_null TO assets_name_not_null');
    await trx.raw('ALTER TABLE assets RENAME CONSTRAINT cards_is_active_not_null TO assets_is_active_not_null');
    await trx.raw('ALTER TABLE assets RENAME CONSTRAINT cards_created_at_not_null TO assets_created_at_not_null');
    await trx.raw('ALTER TABLE assets RENAME CONSTRAINT cards_updated_at_not_null TO assets_updated_at_not_null');
    // v0.2.0 加列时（items）的 NOT NULL 约束；can_stand / category 已改名。
    await trx.raw('ALTER TABLE assets RENAME CONSTRAINT items_width_cells_not_null TO assets_width_cells_not_null');
    await trx.raw('ALTER TABLE assets RENAME CONSTRAINT items_height_cells_not_null TO assets_height_cells_not_null');
    await trx.raw('ALTER TABLE assets RENAME CONSTRAINT items_fit_mode_not_null TO assets_fit_mode_not_null');
    await trx.raw('ALTER TABLE assets RENAME CONSTRAINT items_category_not_null TO assets_type_not_null');
    await trx.raw('ALTER TABLE assets RENAME CONSTRAINT items_can_stand_not_null TO assets_blocking_not_null');
    // 自增序列（`id` 的 DEFAULT nextval 会自动跟随新序列名）。
    await trx.raw('ALTER SEQUENCE cards_id_seq RENAME TO assets_id_seq');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    await trx.raw('ALTER SEQUENCE assets_id_seq RENAME TO cards_id_seq');
    await trx.raw('ALTER TABLE assets RENAME CONSTRAINT assets_blocking_not_null TO items_can_stand_not_null');
    await trx.raw('ALTER TABLE assets RENAME CONSTRAINT assets_type_not_null TO items_category_not_null');
    await trx.raw('ALTER TABLE assets RENAME CONSTRAINT assets_fit_mode_not_null TO items_fit_mode_not_null');
    await trx.raw('ALTER TABLE assets RENAME CONSTRAINT assets_height_cells_not_null TO items_height_cells_not_null');
    await trx.raw('ALTER TABLE assets RENAME CONSTRAINT assets_width_cells_not_null TO items_width_cells_not_null');
    await trx.raw('ALTER TABLE assets RENAME CONSTRAINT assets_updated_at_not_null TO cards_updated_at_not_null');
    await trx.raw('ALTER TABLE assets RENAME CONSTRAINT assets_created_at_not_null TO cards_created_at_not_null');
    await trx.raw('ALTER TABLE assets RENAME CONSTRAINT assets_is_active_not_null TO cards_is_active_not_null');
    await trx.raw('ALTER TABLE assets RENAME CONSTRAINT assets_name_not_null TO cards_name_not_null');
    await trx.raw('ALTER TABLE assets RENAME CONSTRAINT assets_code_not_null TO cards_code_not_null');
    await trx.raw('ALTER TABLE assets RENAME CONSTRAINT assets_id_not_null TO cards_id_not_null');
    await trx.raw('ALTER TABLE assets RENAME CONSTRAINT assets_code_unique TO cards_code_unique');
    await trx.raw('ALTER TABLE assets RENAME CONSTRAINT assets_pkey TO cards_pkey');
  });
}
