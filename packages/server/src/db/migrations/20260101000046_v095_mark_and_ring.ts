import type { Knex } from 'knex';

/**
 * v0.9.5 —— **标记**改名 + **那一圈**合并。
 *
 * 两件事，都是改 JSON 里的键，不动表结构：
 *
 * 1. `themes.data` / `puzzles.data`：
 *    `forbiddenSymbol` → `mark`。
 *
 *    「禁止符号」是玩家把它落下去之后的语义，而作者在配置页面对的是「标一下这格
 *    排除」这个**动作**。界面上一直叫「禁止符号」，选它的时候心里想的是「标记」。
 *    v0.9.5 把界面和数据的名字统一到 `mark`。
 *
 * 2. `themes.data`：`pressRing` 与 `checkStyle.ring` → `ring.image`。
 *
 *    长按计时环和提交校验圈是**同一种东西**：一圈绕着一格走。一个是等它装满、
 *    一个是等它扫完。分成两份配置的结果是作者要传两次图，而且很难保证两张看起来
 *    是一家人。合并之后配置页只有一个上传入口。
 *
 *    `checkStyle` 只留下两档颜色（圈图搬走）。
 *
 * 写入时**删掉旧键**：留着它们会让 `.strict()` 的 schema 拒掉整份数据，也会让
 * 「哪个键才算数」永远说不清。读侧另有一条兜底（`stripLegacyThemeKeys` /
 * `moveLegacyImageKeys`），服务的是**没有走过这条迁移**的数据：冻结的谜题版本行
 * （部署时只读）、旧导出包。
 *
 * 谜题版本行也要改：`puzzles.data` 是版本行和草稿行共用的列，两者都可能是
 * 「游戏正在用的那份 JSON」。不改的话，线上已在跑的游戏读到的还是旧键 ——
 * 虽然读侧能兜住，但让库里出现两种形状只会让下一次迁移更难写。
 */
export async function up(knex: Knex): Promise<void> {
  await rewriteThemes(knex, (data) => renameThemeKeys(data));
  await rewritePuzzles(knex, (data) => renameMark(data));
}

/**
 * 回退 = 把键名搬回 v0.9.5 的样子。
 *
 * 合并过的那一圈**没法拆回去**：`ring.image` 只有一个，而旧结构里 `pressRing`
 * 与 `checkStyle.ring` 是两个独立的位置，谁也不知道它原来是哪一个。回退时把它
 * 写回 `pressRing`（它是先有的那个，也是玩家更常看到的那一圈），`checkStyle`
 * 只剩颜色 —— 校验圈在回退后会画内置本色环。这是有损回退，写在文档里。
 */
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
