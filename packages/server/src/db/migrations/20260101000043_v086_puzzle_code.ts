import type { Knex } from 'knex';
import { PUZZLE_CODE_MAX_LENGTH } from '@loredoku/shared';

/** v0.8.5 §7（docs/v0.8.5.md §7）：puzzles.code 可空、迁移不发明编码（老谜题仍按名称推导路径）；唯一例外是已部署过的关——从 games.slug 剥掉 `puzzle-` 与 v0.8.1 前的难度后缀填回，且写整条血统 root_id（编码是一关的身份，不是版本的属性）。 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('puzzles', (table) => {
    table.string('code', PUZZLE_CODE_MAX_LENGTH);
  });

  await knex.raw(`
    WITH src AS (
      SELECT DISTINCT ON (pz.root_id)
             pz.root_id,
             regexp_replace(
               regexp_replace(g.slug, '^puzzle-', ''),
               '-(very-easy|easy|medium|hard|expert)$', ''
             ) AS code
        FROM puzzles pz
        JOIN games g ON g.puzzle_id = pz.id AND g.deleted_at IS NULL
       WHERE pz.code IS NULL
       ORDER BY pz.root_id, pz.id
    )
    UPDATE puzzles p
       SET code = src.code
      FROM src
     WHERE p.root_id = src.root_id
       AND p.code IS NULL
       AND src.code <> ''
  `);
}

/** 只撤列。上面那一步是**派生**（从 `games.slug` 读出来的），不是作者输入 —— 留着它没有意义，重跑 `up` 会重新算一遍。 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('puzzles', (table) => {
    table.dropColumn('code');
  });
}
