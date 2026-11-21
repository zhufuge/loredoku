import type { Knex } from 'knex';

/** v0.8.5：给存量 games.cover_path 补上它自己那一版谜题（games.puzzle_id）的封面（v0.7.2 §4 定下默认封面后只有重开部署弹窗才复制）；必须写数据而非读时回退——游戏是快照，且「移除封面」写 null，读时回退分不出「从没设过」与「作者删了」；图片文件不复制。 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    UPDATE games AS g
       SET cover_path = pz.cover_path
      FROM puzzles AS pz
     WHERE pz.id = g.puzzle_id
       AND g.cover_path IS NULL
       AND g.deleted_at IS NULL
       AND pz.cover_path IS NOT NULL
  `);
}

/** 回退只撤「仍然是谜题那张图」的行：作者后来自己传过新封面的行不碰（路径不等）， 清过封面的行 `cover_path` 已经是 `NULL`、本来就不在范围内。 上传走的是新文件名（uuid），所以「与谜题封面同路径」只可能是这条迁移写进去的。 */
export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    UPDATE games AS g
       SET cover_path = NULL
      FROM puzzles AS pz
     WHERE pz.id = g.puzzle_id
       AND g.cover_path IS NOT NULL
       AND g.cover_path = pz.cover_path
  `);
}
