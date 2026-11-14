import type { Knex } from 'knex';

/**
 * v0.10.8 —— 把标尺的行列符号从**地图草稿**里剥掉，只留主题那一份。
 *
 * 符号（`style.ruler.columnSymbol` / `rowSymbol`）说什么事：中文地图上「C1 R3」
 * 和「列1 行3」是两种读法，而标尺是玩家定位格子的唯一参照。v0.10.8 把它判成
 * 「这一套世界怎么念行与列」—— 跟识别色、难度分级同一层，属于主题；同一主题下的
 * 几十张图不该各自填一遍，更不该出现「这张印 C、那张印 列」。
 *
 * 于是渲染侧（`MapRulerStrips`）改成按 `themeCode` 去主题里查，地图草稿里的同名
 * 值从此不参与渲染；保存地图时也会被 `stripRulerSymbols` 剥掉。这条迁移处理的是
 * **已经存进去的**那一份：不剥的话，库里会长期留着两处互相矛盾的值，而作者在
 * 地图界面上根本没有改它的入口（「基本信息」抽屉里只有字号与间距）。
 *
 * 只动 `maps.data`：`puzzles.data` 与 `themes.data` 里这份字段各有各的归属 ——
 * 谜题沿用地图形状但符号同样不归它，实测 144 行谜题草稿里一块都没配；主题**就是**
 * 这份配置的家，不能动。
 *
 * 无损：剥掉的只是两个从未生效过的键，字号与间距原样保留。
 */
export async function up(knex: Knex): Promise<void> {
  await rewriteMaps(knex, stripSymbols);
}

/**
 * 回退**故意什么都不做**。
 *
 * 这条迁移剥掉的是两个从未参与过渲染的键（v0.10.8 起渲染只认主题那一份），所以
 * 「回退到旧代码」不需要它们：旧渲染缺这两个键时自己退回 `C` / `R`，与写回出厂值
 * 完全等价。
 *
 * 反过来「把出厂值写给每一张图」是有害的 —— 迁移前只有 2 张图存过这两个键，
 * 补齐 105 张等于把「地图侧也有一份符号」这个刚清掉的东西又造出来，而且每一份都
 * 与主题脱钩。宁可 let it be：数据比迁移前更干净，语义不变。
 */
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
