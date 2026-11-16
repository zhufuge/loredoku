import type { Knex } from 'knex';

/**
 * v0.10.9 — 资源的「背景修饰」标记。
 *
 * 一键新列 `assets.decoration`：勾了它的**物品**资源会被放到「背景修饰层」，
 * 而不是普通物品层。它和 `blocking` 是同一种东西 —— 资源层面的一句行为声明，
 * 不是第三种资源类型（`type` 仍然只有 `background` / `item` 两种），所以加在
 * 资源行上而不是新开类型。
 *
 * 默认 `false`：存量资源一个都不勾，行为与本版之前完全一致。背景资源的这一列
 * 恒为 `false` —— 由 `decorationFor()` 在写入侧保证，这里不给数据库约束，理由
 * 与 `blocking` 一致：一条 CHECK 管不住历史数据与将来的导入路径。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('assets', (table) => {
    table.boolean('decoration').notNullable().defaultTo(false);
  });
}

/**
 * 回退只删列。勾选状态没有别处记录，且它只是一个开关 —— 丢掉不损坏任何草稿：
 * 已经放在背景修饰层上的格子，回退后渲染侧读不到这一层，那些格子会静默消失
 * （`maps.data.cells[].decoration` 仍在，重新升级即可复原）。
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('assets', (table) => {
    table.dropColumn('decoration');
  });
}
