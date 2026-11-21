import type { Knex } from 'knex';

/** v0.8.3：撤掉写死五档的 games_difficulty_check（与主题自定义档冲突，作者加第六档会 500），difficulty 放宽 16→32（同 GAME_DIFFICULTY_KEY_MAX_LENGTH），值域搬到应用层（gameDeploySchema 守形状、gameService 按主题 difficultyLevels 核对）。 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE games DROP CONSTRAINT IF EXISTS games_difficulty_check');
  await knex.raw('ALTER TABLE games ALTER COLUMN difficulty TYPE varchar(32)');
}

/** 回退 = 把列收回 16、把约束装回去。 **回退会改写数据**：自定义档（不在这五个里）在装回约束之前全部落成 `medium`， 否则 `ADD CONSTRAINT` 会因为存量行失败、整个回滚卡死。这些行原本的档位名只存在 `themes.data.difficultyLevels` 里，装回约束之后就成了孤儿 —— 属于「降级本就丢掉降级之后的功能」的一部分，不是静默的数据损坏。 */
export async function down(knex: Knex): Promise<void> {
  /* 五个名字**抄死在这里**，不从 `@loredoku/shared` 引：迁移是历史快照，它该按「当时那一版」的五个值回退，而不是跟着今天（也许又改过的）常量走。 */
  const allowed = ['veryEasy', 'easy', 'medium', 'hard', 'expert']
    .map((level) => `'${level}'`)
    .join(', ');
  await knex.raw(`UPDATE games SET difficulty = 'medium' WHERE difficulty NOT IN (${allowed})`);
  await knex.raw('ALTER TABLE games ALTER COLUMN difficulty TYPE varchar(16)');
  await knex.raw(
    `ALTER TABLE games ADD CONSTRAINT games_difficulty_check CHECK (difficulty IN (${allowed}))`,
  );
}
