import type { Knex } from 'knex';

/** v0.9.5：只改 JSON 键、不动表结构——themes/puzzles.data 的 forbiddenSymbol→mark，themes.data 的 pressRing 与 checkStyle.ring 合并为 ring.image（checkStyle 只剩两档颜色，两者本来就是「一圈绕着一格走」的同一种东西）；写入时删旧键（留着会被 .strict() schema 拒掉整份数据），读侧 stripLegacyThemeKeys / moveLegacyImageKeys 兜没走过本迁移的冻结版本行与旧导出包；谜题版本行与草稿行共用 puzzles.data，一并改。 */
export async function up(knex: Knex): Promise<void> {
  await rewriteThemes(knex, (data) => renameThemeKeys(data));
  await rewritePuzzles(knex, (data) => renameMark(data));
}

/** 回退 = 把键名搬回 v0.9.5 的样子。 合并过的那一圈**没法拆回去**：`ring.image` 只有一个，而旧结构里 `pressRing` 与 `checkStyle.ring` 是两个独立的位置，谁也不知道它原来是哪一个。回退时把它写回 `pressRing`（它是先有的那个，也是玩家更常看到的那一圈），`checkStyle` 只剩颜色 —— 校验圈在回退后会画内置本色环。这是有损回退，写在文档里。 */
export async function down(knex: Knex): Promise<void> {
  await rewriteThemes(knex, (data) => restoreThemeKeys(data));
  await rewritePuzzles(knex, (data) => restorePuzzleKeys(data));
}

async function rewriteThemes(
  knex: Knex,
  rewrite: (data: Record<string, unknown>) => Record<string, unknown> | null,
): Promise<void> {
  const rows = (await knex('themes').select('id', 'data')) as Array<{
    id: string | number;
    data: unknown;
  }>;
  for (const row of rows) {
    const data = asObject(row.data);
    if (!data) continue;
    const next = rewrite(data);
    if (!next) continue;
    await knex('themes').where({ id: row.id }).update({ data: JSON.stringify(next) });
  }
}

async function rewritePuzzles(
  knex: Knex,
  rewrite: (data: Record<string, unknown>) => Record<string, unknown> | null,
): Promise<void> {
  const rows = (await knex('puzzles').select('id', 'data')) as Array<{
    id: string | number;
    data: unknown;
  }>;
  for (const row of rows) {
    const data = asObject(row.data);
    if (!data) continue;
    const next = rewrite(data);
    if (!next) continue;
    await knex('puzzles').where({ id: row.id }).update({ data: JSON.stringify(next) });
  }
}

/** `themes.data`：标记改名 + 那一圈合并。返回 `null` = 这一行没有要改的。 */
function renameThemeKeys(source: Record<string, unknown>): Record<string, unknown> | null {
  const data = renameMark(source);
  if (!data) return null;

  const ring = imagePathOf(data['ring']) ?? imagePathOf(data['pressRing']) ?? ringFromCheckStyle(data);
  delete data['pressRing'];

  const checkStyle = asObject(data['checkStyle']);
  if (checkStyle) {
    const { ring: legacyCheckRing, ...colors } = checkStyle;
    void legacyCheckRing;
    data['checkStyle'] = colors;
  }

  if (ring) data['ring'] = { image: { path: ring } };
  else delete data['ring'];

  return data;
}

/** 回退：`mark → forbiddenSymbol`；`ring.image → pressRing`。 */
function restoreThemeKeys(source: Record<string, unknown>): Record<string, unknown> | null {
  const data = restorePuzzleKeys(source);
  if (!data) return null;

  const ringPath = imagePathOf(data['ring']);
  if (ringPath) data['pressRing'] = { path: ringPath };
  delete data['ring'];

  return data;
}

/** `puzzles.data`：只改名。返回 `null` = 没有旧键要搬。 */
function renameMark(source: Record<string, unknown>): Record<string, unknown> | null {
  if (!('forbiddenSymbol' in source)) return null;
  const data = { ...source };
  if (!('mark' in data)) data['mark'] = data['forbiddenSymbol'];
  delete data['forbiddenSymbol'];
  return data;
}

function restorePuzzleKeys(source: Record<string, unknown>): Record<string, unknown> | null {
  if (!('mark' in source)) return null;
  const data = { ...source };
  if (!('forbiddenSymbol' in data)) data['forbiddenSymbol'] = data['mark'];
  delete data['mark'];
  return data;
}

/** 从 `{ path }` / `{ image: { path } }` 取路径。 */
function imagePathOf(value: unknown): string | null {
  const record = asObject(value);
  if (!record) return null;
  if (typeof record['path'] === 'string') return record['path'];
  const image = asObject(record['image']);
  if (image && typeof image['path'] === 'string') return image['path'];
  return null;
}

/** 旧 `checkStyle.ring: { path }` 里那张校验圈图。 */
function ringFromCheckStyle(data: Record<string, unknown>): string | null {
  const checkStyle = asObject(data['checkStyle']);
  return checkStyle ? imagePathOf(checkStyle['ring']) : null;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}
