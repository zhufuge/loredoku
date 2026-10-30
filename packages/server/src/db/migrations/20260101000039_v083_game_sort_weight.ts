import type { Knex } from 'knex';

/**
 * v0.8.3 —— `games.sort_weight`：作者给部署排序用的权重。
 *
 * 在这之前，所有游戏列表（玩家首页、部署页、资源包里的顺序）都按部署时间倒序
 * 排 —— 那只回答了「最近做了什么」，没回答「玩家该先玩哪一关」。作者能决定的
 * 只有名字和路径，想让某一关排前面只能改路径，等于拿对外地址当排序工具。
 *
 * 约定：
 *
 * - **升序**，数字小的排前面；默认 `0`；
 * - 同权重按**访问路径**（`slug`）排 —— 一个确定的兜底，而不是回到 `created_at`
 *   （那会让「顺序」这一列在两个权重相同的行之间失效）；
 * - 全部为 `0`（存量数据）时，列表就是按路径字母序，稳定且可预测。
 *
 * 列名用 `sort_weight` 而不是复用 `sort_order`：`sort_order` 在本仓的既有语义是
 * 「同一容器内的序号」（资源形态、主题部署项），由系统按插入位置维护；这一列
 * 是**作者手填的偏好**，语义不同，名字也该不同。
 */
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
