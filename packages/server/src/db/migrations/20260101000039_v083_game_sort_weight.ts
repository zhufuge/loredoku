import type { Knex } from 'knex';

/** v0.8.3：games 加 sort_weight（作者手填的部署排序，升序、默认 0，同权重按 slug 兜底，故存量全 0 时即路径字母序）；不复用 sort_order——后者是系统维护的容器内序号，语义不同。 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('games', (table) => {
    table.integer('sort_weight').notNullable().defaultTo(0);
    // 列表查询一律 `WHERE deleted_at IS NULL ORDER BY sort_weight, slug`。
    table.index(['sort_weight', 'slug'], 'games_sort_weight_slug_idx');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('games', (table) => {
    table.dropIndex(['sort_weight', 'slug'], 'games_sort_weight_slug_idx');
    table.dropColumn('sort_weight');
  });
}
