import type { Knex } from 'knex';

/** v0.8.3（docs/v0.8.3.md §15）：主题由软删改硬删、删 themes.deleted_at——主题没有版本号也不被按 id 解析（子表 theme_id 全是 ON DELETE RESTRICT，删前须清空），软删只会让 code 唯一键被尸体行占住；up 先清空无引用尸体再删列，仍被引用则报错中止。 */

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
