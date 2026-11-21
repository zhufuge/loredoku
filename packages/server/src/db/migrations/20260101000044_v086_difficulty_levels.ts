import type { Knex } from 'knex';

/** v0.8.6（docs/v0.8.6.md §3）：难度从字符串标识改成数字档位，顺序不能反——先把 themes.data.difficultyLevels 的 {key,label} 按当时数组顺序从 1 编成 {level,label}（这样已部署关的热力坡颜色与徽章不变），再按所属主题映射把 games.difficulty 换成 smallint；认不出的标识按内置五档/1 兜底（本就是孤儿行），deleted_at 非空的行也一起换（换列类型是整列的事），列名仍叫 difficulty（代码里约 40 处引用）。 */
export async function up(knex: Knex): Promise<void> {
  /* 五个旧名字 -> 档位。**抄死在这里**而不是引 shared：迁移是历史快照，它该按 v0.8.3 那五个值换算，而不是跟着今天（也许又改过的）常量走。 */
  const legacyLevels: Record<string, number> = {
    veryEasy: 1,
    easy: 2,
    medium: 3,
    hard: 4,
    expert: 5,
  };

  const themes = (await knex('themes').select('id', 'data')) as Array<{
    id: string | number;
    data: unknown;
  }>;

  /** 主题 id → （旧标识 → 档位）。 */
  const keyMaps = new Map<number, Map<string, number>>();

  for (const theme of themes) {
    const data = asObject(theme.data);
    const levels = data?.['difficultyLevels'];
    if (!Array.isArray(levels) || levels.length === 0) continue;

    const keyMap = new Map<string, number>();
    const next = levels.map((entry, index) => {
      const tier = asObject(entry) ?? {};
      const level = index + 1;
      if (typeof tier['key'] === 'string') keyMap.set(tier['key'], level);
      return { level, label: typeof tier['label'] === 'string' ? tier['label'] : `第 ${level} 档` };
    });

    keyMaps.set(Number(theme.id), keyMap);
    data!['difficultyLevels'] = next;
    await knex('themes')
      .where({ id: theme.id })
      .update({ data: JSON.stringify(data) });
  }

  /* 先加新列、再回填、最后删旧列：直接 `ALTER COLUMN TYPE smallint USING` 要在 SQL 里再做一次「名字 → 数字」的映射，而那张表在 JSONB 里 —— 与其在 SQL 里解析，不如在 TypeScript 里算完写回去。 */
  await knex.schema.alterTable('games', (table) => {
    table.smallint('difficulty_level');
  });

  const games = (await knex('games as g')
    .join('puzzles as p', 'p.id', 'g.puzzle_id')
    .select('g.id as id', 'g.difficulty as difficulty', 'p.theme_id as theme_id')) as Array<{
    id: string | number;
    difficulty: string;
    theme_id: string | number;
  }>;

  for (const game of games) {
    const keyMap = keyMaps.get(Number(game.theme_id));
    const level = keyMap?.get(game.difficulty) ?? legacyLevels[game.difficulty] ?? 1;
    await knex('games').where({ id: game.id }).update({ difficulty_level: level });
  }

  await knex.schema.alterTable('games', (table) => {
    table.dropColumn('difficulty');
  });
  await knex.raw('ALTER TABLE games RENAME COLUMN difficulty_level TO difficulty');
  await knex.raw('ALTER TABLE games ALTER COLUMN difficulty SET NOT NULL');
}

/** 回退 = 把数字换回 v0.8.3 的字符串标识。 1…5 换回内置的五个名字（这些名字 v0.8.3 里是合法的）；自定义档位换回 `tier-N` —— v0.8.3 里「添加一档」生成的就是这个形状，虽然不一定是原来那个名字，但**档位本身还在**，徽章长得一样。档位名（label）原样留着。 */
export async function down(knex: Knex): Promise<void> {
  const legacyKeys: Record<number, string> = {
    1: 'veryEasy',
    2: 'easy',
    3: 'medium',
    4: 'hard',
    5: 'expert',
  };
  const keyOf = (level: number): string => legacyKeys[level] ?? `tier-${level}`;

  const themes = (await knex('themes').select('id', 'data')) as Array<{
    id: string | number;
    data: unknown;
  }>;

  for (const theme of themes) {
    const data = asObject(theme.data);
    const levels = data?.['difficultyLevels'];
    if (!Array.isArray(levels) || levels.length === 0) continue;

    data!['difficultyLevels'] = levels.map((entry) => {
      const tier = asObject(entry) ?? {};
      const level = typeof tier['level'] === 'number' ? tier['level'] : 1;
      return {
        key: keyOf(level),
        label: typeof tier['label'] === 'string' ? tier['label'] : `第 ${level} 档`,
      };
    });
    await knex('themes')
      .where({ id: theme.id })
      .update({ data: JSON.stringify(data) });
  }

  await knex.schema.alterTable('games', (table) => {
    table.string('difficulty_key', 32);
  });

  const games = (await knex('games').select('id', 'difficulty')) as Array<{
    id: string | number;
    difficulty: number;
  }>;
  for (const game of games) {
    await knex('games')
      .where({ id: game.id })
      .update({ difficulty_key: keyOf(Number(game.difficulty)) });
  }

  await knex.schema.alterTable('games', (table) => {
    table.dropColumn('difficulty');
  });
  await knex.raw('ALTER TABLE games RENAME COLUMN difficulty_key TO difficulty');
  await knex.raw('ALTER TABLE games ALTER COLUMN difficulty SET NOT NULL');
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}
