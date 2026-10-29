import type { Knex } from 'knex';

/**
 * v0.8.0 §19 —— 删掉 `themes.is_default`。
 *
 * 上一版（`20260101000037`）给主题配了一个「默认主题」：没给主题的新内容落在这里，
 * 主题列表把它排在最前，删除时它被特殊保护。三件事在「主题 = 工作空间」之后都不
 * 成立了：
 *
 *   1. 工作是**在一间工作台里**发生的（`/hlm/maps`），没有「没给主题」这种情形 ——
 *      服务端猜一个落点，等于把作者建的东西放进另一个世界；
 *   2. 列表顺序不该由一个布尔列决定，按创建顺序（`id`）就够了；
 *   3. 「默认主题不能删」是一条只对那一行成立的规则，而它其实只是「还有内容」的
 *      另一种说法 —— 护栏 3（有内容就拦）已经覆盖。
 *
 * 删列而不是留着不读：留一列没人读的布尔值，下一个人会以为它还有语义，然后为它
 * 写第二套判断。数据库里不该有「历史遗留的承诺」。
 *
 * 迁移**不删任何数据行**：`code = 'default'` 的那个主题还在，只是不再特殊。它是
 * 历史内容的归属地，删掉会让 `theme_id` 悬挂。
 */
export async function up(knex: Knex): Promise<void> {
  // 那条 partial unique index 依赖这一列，必须先删索引再删列。
  await knex.raw('DROP INDEX IF EXISTS themes_default_unique');
  await knex.schema.alterTable('themes', (table) => {
    table.dropColumn('is_default');
  });
}

/**
 * 回滚：把列和「恰好一个」的约束都装回去，并让 `code = 'default'` 重新成为默认。
 *
 * 这只是为了迁移可逆 —— 回滚之后代码（不认识 `is_default`）仍能正常跑，列会一直
 * 是它自己的默认值。真要回到「有默认主题」的版本，回滚这一条就够。
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('themes', (table) => {
    table.boolean('is_default').notNullable().defaultTo(false);
  });
  await knex('themes').where({ code: 'default' }).update({ is_default: true });
  await knex.raw(
    'CREATE UNIQUE INDEX themes_default_unique ON themes (is_default) WHERE is_default',
  );
}
