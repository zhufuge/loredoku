import type { Knex } from 'knex';

/** v0.10.8：剥掉 maps.data 的 style.ruler.columnSymbol / rowSymbol，只留主题那一份（符号判为「这个主题怎么念行列」，同识别色/难度分级；渲染侧 MapRulerStrips 改按 themeCode 查主题，保存时 stripRulerSymbols 也会剥）；只动 maps.data——themes.data 是这份配置的家、puzzles.data 从未配过；无损，且 down 故意 no-op（旧渲染缺键时自退回 C / R，补齐反而会把刚清掉的副本再造一遍）。 */
export async function up(knex: Knex): Promise<void> {
  await rewriteMaps(knex, stripSymbols);
}

/** 回退**故意什么都不做**。 这条迁移剥掉的是两个从未参与过渲染的键（v0.10.8 起渲染只认主题那一份），所以「回退到旧代码」不需要它们：旧渲染缺这两个键时自己退回 `C` / `R`，与写回出厂值完全等价。 反过来「把出厂值写给每一张图」是有害的 —— 迁移前只有 2 张图存过这两个键， 补齐 105 张等于把「地图侧也有一份符号」这个刚清掉的东西又造出来，而且每一份都与主题脱钩。宁可 let it be：数据比迁移前更干净，语义不变。 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function down(_knex: Knex): Promise<void> {
  // 见上：无操作。
}

async function rewriteMaps(
  knex: Knex,
  convert: (data: unknown) => unknown,
): Promise<void> {
  const rows = await knex('maps').select('id', 'data');
  for (const row of rows) {
    const next = convert(row.data);
    if (next === row.data) continue;
    await knex('maps')
      .where({ id: row.id })
      .update({ data: JSON.stringify(next) });
  }
}

function stripSymbols(data: unknown): unknown {
  const style = styleOf(data);
  const ruler = style?.ruler;
  if (!ruler || typeof ruler !== 'object') return data;
  if (!('columnSymbol' in ruler) && !('rowSymbol' in ruler)) return data;
  const { columnSymbol: _columnSymbol, rowSymbol: _rowSymbol, ...rest } = ruler as Record<
    string,
    unknown
  >;
  return withStyle(data, { ...style, ruler: rest });
}

function styleOf(data: unknown): Record<string, unknown> | null {
  if (!isRecord(data)) return null;
  const style = data.style;
  return isRecord(style) ? style : null;
}

function withStyle(data: unknown, style: Record<string, unknown>): unknown {
  return { ...(data as Record<string, unknown>), style };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
