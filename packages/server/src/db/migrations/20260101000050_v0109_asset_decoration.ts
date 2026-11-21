import type { Knex } from 'knex';

/** v0.10.9：assets 加 decoration 布尔标记——勾了的物品资源放到「背景修饰层」；它和 blocking 同属资源层的一句行为声明，type 仍只有 background / item 两种，所以加列而不新开类型；默认 false（存量行为不变），背景资源恒 false 由 decorationFor() 在写入侧保证、不加 CHECK（管不住历史数据与将来的导入路径）。 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('assets', (table) => {
    table.boolean('decoration').notNullable().defaultTo(false);
  });
}

/** 回退只删列。勾选状态没有别处记录，且它只是一个开关 —— 丢掉不损坏任何草稿： 已经放在背景修饰层上的格子，回退后渲染侧读不到这一层，那些格子会静默消失（`maps.data.cells[].decoration` 仍在，重新升级即可复原）。 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('assets', (table) => {
    table.dropColumn('decoration');
  });
}
