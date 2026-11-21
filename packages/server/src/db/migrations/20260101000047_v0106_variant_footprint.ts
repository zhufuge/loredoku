import type { Knex } from 'knex';

/** v0.10.6：把「占几格」搬回 asset_variants 加 w / h（尺寸是形态自己的属性，放置时按 w/h 写进画布锚点，点其中任一格整张一起联动）；两列 NOT NULL DEFAULT 1，存量与旧导出包一律 1×1，toAssetVariant() 另有 ?? 1 兜底；不能叫 width_cells / height_cells——历史迁移 down() 会加回那两个名字、v0.7.6 测试断言它们不存在；down 只删列（值全是默认）。 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('asset_variants', (table) => {
    table.integer('w').notNullable().defaultTo(1);
    table.integer('h').notNullable().defaultTo(1);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('asset_variants', (table) => {
    table.dropColumn('w');
    table.dropColumn('h');
  });
}
