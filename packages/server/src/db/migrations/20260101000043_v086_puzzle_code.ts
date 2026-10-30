import type { Knex } from 'knex';
import { PUZZLE_CODE_MAX_LENGTH } from '@loredoku/shared';

/**
 * v0.8.5 §7（docs/v0.8.5 §7.md §3）：谜题的**编码** —— 部署时用它预填访问路径。
 *
 * 可空，且迁移**不发明**编码：v0.8.5 之前建的谜题没有这一列，凭空给它们编一串
 * 号（`puzzle-12` 之类）只是把「没有」伪装成「有」。它们仍然部署得了，弹窗退回
 * 按名称推导路径（v0.4.1 起的老行为）。
 *
 * 唯一例外是**已经部署过**的那几关：它们的路径本来就在库里，剥掉 `puzzle-`
 * 就是这条谜题对外的名字 —— 填回去，列表里那列不至于一排「—」，重新部署时
 * 预填出来的路径也和原链接一字不差。
 *
 * 两处细节：
 * - **写整条血统**（`root_id`）。游戏的 `puzzle_id` 指向版本行，只写那一行的话，
 *   同一条谜题的草稿行会在列表里显示「—」—— 编码是这一关的身份，不是版本的属性。
 * - 顺手剥掉 v0.8.1 之前留在路径尾部的难度后缀（`-hard` / `-very-easy` …）。那段
 *   后缀已经不参与路径生成，留在编码里只会让下一次部署把它再写一遍。
 */
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

/**
 * 只撤列。上面那一步是**派生**（从 `games.slug` 读出来的），不是作者输入 ——
 * 留着它没有意义，重跑 `up` 会重新算一遍。
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('puzzles', (table) => {
    table.dropColumn('code');
  });
}
