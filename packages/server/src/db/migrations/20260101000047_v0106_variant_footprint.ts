import type { Knex } from 'knex';

/**
 * v0.10.6 —— 把「占几格」搬回 `asset_variants`。
 *
 * v0.7.6 把 `width_cells` / `height_cells` 删了，理由是新放的物品恒 1×1、
 * 放大靠 `scale`。但「一张床横跨 2 格」是**这个形态长什么样**，不是「这一次
 * 放哪儿」：同一个形态每次放都该一样大，而且放下去之后点其中任一格，整张床
 * 要一起联动。所以尺寸归形态，放置时按 `w` / `h` 写进画布锚点。
 *
 * 两列都 `NOT NULL DEFAULT 1`：存量形态（以及没走过这条迁移的旧导出包读出来的
 * 行）一律 1×1，`toAssetVariant()` 另有 `?? 1` 兜底。名字用 `w` / `h`，跟
 * `DraftAnchorItem` 一致 —— 不能再叫 `width_cells` / `height_cells`，历史迁移
 * 的 down() 会往回加那两个名字，而 v0.7.6 的服务端测试断言它们不存在。
 *
 * `down()` 只是删列（数据不可再生，但全是默认值，服务降级后仍按 1×1 画）。
 */
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
