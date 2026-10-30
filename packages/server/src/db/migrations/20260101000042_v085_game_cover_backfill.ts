import type { Knex } from 'knex';

/**
 * v0.8.5 —— 把「部署时该抄过来的谜题封面」补给存量行。
 *
 * 症状：部署页的缩略图是空白的，只有一个首字母。查下来不是渲染坏了（有封面的行
 * 画得好好的），而是 `games.cover_path` 为空 —— 13 条部署里只有 2 条有封面，
 * 而它们的谜题里 14 条有封面。原因在时间线：v0.7.2 §4 才定下「谜题封面是游戏的
 * 默认封面」，之后只有**再次打开部署弹窗**才会把那张图复制过来；在那之前部署的
 * 行永远停在空封面。
 *
 * 语义上没有新增规矩：v0.7.2 已经说了「作者不选文件，就把谜题那张复制成游戏
 * 封面」。这条迁移只是把漏掉的那一次复制一次补齐 —— 等于对每条旧部署重新打开
 * 一次弹窗、点一次保存。
 *
 * 为什么是**写数据**而不是读的时候回退到谜题封面：
 *
 * - 部署出来的游戏是那一版谜题的**快照**（v0.6/§CONS-K16 的整条链都建立在这上面）。
 *   读时回退会让旧游戏的封面随谜题一起变，快照就不再是快照；
 * - 部署弹窗有「移除封面」（OPT-W03 §3），它把 `cover_path` 写成 `null`。读时
 *   回退分不出「从没设过」与「作者明确删了」，会把删掉的图又变回来。
 *
 * 每个游戏指到的是**它自己那一版**谜题的封面（`games.puzzle_id`），不是同名谜题
 * 的最新封面 —— 快照关系必须按行对上。文件不复制：图片只在 `cover_path` 里被
 * 引用，删封面时也不 unlink，两个行指向同一个文件是安全的。
 */
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

/**
 * 回退只撤「仍然是谜题那张图」的行：作者后来自己传过新封面的行不碰（路径不等），
 * 清过封面的行 `cover_path` 已经是 `NULL`、本来就不在范围内。
 *
 * 上传走的是新文件名（uuid），所以「与谜题封面同路径」只可能是这条迁移写进去的。
 */
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
