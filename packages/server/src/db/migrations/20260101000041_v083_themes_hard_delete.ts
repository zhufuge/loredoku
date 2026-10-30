import type { Knex } from 'knex';

/**
 * v0.8.3（docs/v0.8.3.md §15）—— 主题从软删改成**硬删**，`themes.deleted_at` 退役。
 *
 * 为什么可以这么干脆：软删是照抄 `maps` / `puzzles` / `games` 的，而那三张表的软删
 * 各有硬需求（版本号靠 `MAX(version)+1` 不回收、`games.slug` 靠部分唯一索引释放、
 * 软删行仍能按 `:id` 解析血统根）。主题一条都不占：没有版本号，也没有任何行按 id
 * 引用它 —— 子表的 `theme_id` 全是 `ON DELETE RESTRICT`，删之前必须清空。
 *
 * 它反而制造了两个麻烦：`themes.code` 是普通 UNIQUE，尸体行永远占着编码，同编码
 * 重建撞唯一约束（接口回 500）；尸体还会一直堆着（v0.8.0 §19.7 清过 78 具）。
 *
 * up 分两步：先把历史尸体清掉，再删列。清不掉的是「有子行引用」的那种 ——
 * 那说明它不是空主题，删了会牵走内容，宁可让迁移失败并报出编码，让人自己看。
 */

const REFERENCING_TABLES = ['assets', 'characters', 'maps', 'puzzles', 'theme_deployments'] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    const notReferenced = REFERENCING_TABLES.map(
      (table) => `NOT EXISTS (SELECT 1 FROM ${table} r WHERE r.theme_id = t.id)`,
    ).join('\n      AND ');

    const deleted = (await trx.raw(`
      DELETE FROM themes t
      WHERE t.deleted_at IS NOT NULL
        AND ${notReferenced}
      RETURNING t.code
    `)) as { rows?: Array<{ code: string }> };
    const purged = (deleted.rows ?? []).map((row) => row.code);

    const leftovers = (await trx('themes').whereNotNull('deleted_at').select('code')) as Array<{
      code: string;
    }>;
    if (leftovers.length > 0) {
      throw new Error(
        `v0.8.3 迁移：还有 ${leftovers.length} 个已软删的主题挂着内容（${leftovers
          .slice(0, 5)
          .map((row) => row.code)
          .join(', ')}），请先人工核对再跑 —— 硬删会连带删掉它们下面的行`,
      );
    }

    if (purged.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`v0.8.3 迁移：清掉 ${purged.length} 个已软删的空主题`);
    }

    await trx.schema.alterTable('themes', (table) => {
      table.dropColumn('deleted_at');
    });
  });
}

/** 回滚只加回列（nullable、无默认值）：旧代码的查询会恒为「未删」，行为等价。 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('themes', (table) => {
    table.timestamp('deleted_at', { useTz: true });
  });
}
