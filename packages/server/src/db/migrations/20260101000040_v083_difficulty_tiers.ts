import type { Knex } from 'knex';

/**
 * v0.8.3 —— 难度分级从「写死的枚举」变成「主题说了算」。
 *
 * v0.4.0 建 `map_games` 时给 `difficulty` 加了一条 `CHECK (... IN ('veryEasy',
 * 'easy', 'medium', 'hard', 'expert'))`（v0.6.0 随表改名成 `games_difficulty_check`）。
 * 那和「概览页自己定义几档」是直接冲突的：作者加的第六档 `puzzle-6` 会撞在约束上，
 * 得到一个 500，而界面上它明明保存成功了。
 *
 * 所以这里**撤掉那条 CHECK**，并把列从 16 放宽到 32（与 `GAME_DIFFICULTY_KEY_MAX_LENGTH`
 * 一致）。合法的值域搬到应用层：`gameDeploySchema` 把守形状，`gameService` 拿
 * 谜题所属主题的 `difficultyLevels` 核对「这一档在不在这个主题里」—— 那是数据库
 * 做不到的事（分级存在 JSONB 里，而且只有服务端知道是哪个主题）。
 *
 * 列的默认值不变（原本就没有默认值，写入由仓储负责）。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE games DROP CONSTRAINT IF EXISTS games_difficulty_check');
  await knex.raw('ALTER TABLE games ALTER COLUMN difficulty TYPE varchar(32)');
}

/**
 * 回退 = 把列收回 16、把约束装回去。
 *
 * **回退会改写数据**：自定义档（不在这五个里）在装回约束之前全部落成 `medium`，
 * 否则 `ADD CONSTRAINT` 会因为存量行失败、整个回滚卡死。这些行原本的档位名只存在
 * `themes.data.difficultyLevels` 里，装回约束之后就成了孤儿 —— 属于「降级本就
 * 丢掉降级之后的功能」的一部分，不是静默的数据损坏。
 */
export async function down(knex: Knex): Promise<void> {
  /*
   * 五个名字**抄死在这里**，不从 `@loredoku/shared` 引：迁移是历史快照，它该按
   * 「当时那一版」的五个值回退，而不是跟着今天（也许又改过的）常量走。
   */
  const allowed = ['veryEasy', 'easy', 'medium', 'hard', 'expert']
    .map((level) => `'${level}'`)
    .join(', ');
  await knex.raw(`UPDATE games SET difficulty = 'medium' WHERE difficulty NOT IN (${allowed})`);
  await knex.raw('ALTER TABLE games ALTER COLUMN difficulty TYPE varchar(16)');
  await knex.raw(
    `ALTER TABLE games ADD CONSTRAINT games_difficulty_check CHECK (difficulty IN (${allowed}))`,
  );
}
