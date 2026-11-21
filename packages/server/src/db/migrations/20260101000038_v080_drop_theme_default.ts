import type { Knex } from 'knex';

/** v0.8.0 §19：删 themes.is_default（「主题=工作空间」后没有「未给主题」的内容，列表顺序按 id，删除保护已被护栏 3 覆盖）；不删任何数据行——code='default' 主题仍在，否则 theme_id 悬挂；依赖它的 themes_default_unique 必须先删索引再删列。 */
export async function up(knex: Knex): Promise<void> {
  // 那条 partial unique index 依赖这一列，必须先删索引再删列。
  await knex.raw('DROP INDEX IF EXISTS themes_default_unique');
  await knex.schema.alterTable('themes', (table) => {
    table.dropColumn('is_default');
  });
}

/** 回滚：把列和「恰好一个」的约束都装回去，并让 `code = 'default'` 重新成为默认。 这只是为了迁移可逆 —— 回滚之后代码（不认识 `is_default`）仍能正常跑，列会一直是它自己的默认值。真要回到「有默认主题」的版本，回滚这一条就够。 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('themes', (table) => {
    table.boolean('is_default').notNullable().defaultTo(false);
  });
  await knex('themes').where({ code: 'default' }).update({ is_default: true });
  await knex.raw(
    'CREATE UNIQUE INDEX themes_default_unique ON themes (is_default) WHERE is_default',
  );
}
