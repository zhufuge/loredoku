import type { Knex } from 'knex';

/** v0.6.0：assets 源自 cards，两次 renameTable（cards→items→assets）都不会改 PG 隐式命名，主键/唯一/NOT NULL 约束与自增序列仍带 cards_ / items_ 前缀，这里统一收口成 assets_*（blocking/type 的 NOT NULL 约束按新列名）；单事务。 */
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
