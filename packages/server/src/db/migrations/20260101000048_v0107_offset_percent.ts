import type { Knex } from 'knex';

/** v0.10.7：三处偏移（style.canvasShadow.offset、style.operationCursorBox.offset、regions[].style.label.offset.{x,y}）从画布像素改成「格的百分比」（100 = 一格），否则同一套数值随格子大小与标尺开关漂移；折算用该行 style.cellSize，缺省 BASE_CELL = 120（packages/shared/src/constants/grid.ts）；**有损**：结果取整、往返不保证逐位相等（docs/v0.10.7.md §9）。 */
export async function up(knex: Knex): Promise<void> {
  await rewrite(knex, (style, regions, cell) =>
    convertStyle(style, regions, cell, (v) => toPercent(v, cell)),
  );
}

/**
 * 回退 = 百分比换回像素（同样取整）。 往返不保证逐位相等：`36px / 168px * 100 → 21%`，再回退是 `21 * 168 / 100 → 35px`。差 1px 在这个尺度上看不出来，但确实不是原值 —— 想精确回退只能从备份恢复。写在 `docs/v0.10.7.md` §9。
 */
export async function down(knex: Knex): Promise<void> {
  await rewrite(knex, (style, regions, cell) =>
    convertStyle(style, regions, cell, (v) => toPixels(v, cell)),
  );
}

/** 三张表都存着同一种「草稿 JSON」，迁移逻辑一模一样，只是列名不同。 */
async function rewrite(
  knex: Knex,
  convert: (
    style: Record<string, unknown>,
    regions: unknown,
    cellSize: number,
  ) => boolean,
): Promise<void> {
  await eachRow(knex, 'themes');
  await eachRow(knex, 'maps');
  await eachRow(knex, 'puzzles');

  async function eachRow(conn: Knex, table: 'themes' | 'maps' | 'puzzles'): Promise<void> {
    const rows = (await conn(table).select('id', 'data')) as Array<{
      id: string | number;
      data: unknown;
    }>;
    for (const row of rows) {
      const data = asObject(row.data);
      if (!data) continue;
      const style = asObject(data['style']);
      // 没有风格 = 全走缺省；缺省值本身已经是百分比（代码里改过），不用动。
      if (!style) continue;
      const cell = cellSizeOf(style);
      const regionList = Array.isArray(data['regions']) ? data['regions'] : null;
      if (!convert(style, regionList, cell)) continue;
      await conn(table)
        .where({ id: row.id })
        .update({ data: JSON.stringify(data) });
    }
  }
}

/** 把三处偏移就地换算。返回「有没有改动」—— 全空的行不写库，省得给每一行都盖一个新的 `updated_at` 语义（这里不动 `updated_at`，只是避免无意义的 UPDATE）。 */
function convertStyle(
  style: Record<string, unknown>,
  regions: unknown,
  cellSize: number,
  convertValue: (value: number) => number,
): boolean {
  let changed = false;

  const shadow = asObject(style['canvasShadow']);
  if (shadow && typeof shadow['offset'] === 'number') {
    shadow['offset'] = convertValue(shadow['offset']);
    changed = true;
  }

  const operation = asObject(style['operationCursorBox']);
  if (operation && typeof operation['offset'] === 'number') {
    operation['offset'] = convertValue(operation['offset']);
    changed = true;
  }

  if (Array.isArray(regions)) {
    for (const region of regions) {
      const regionStyle = asObject(asObject(region)?.['style']);
      const label = asObject(regionStyle?.['label']);
      const offset = asObject(label?.['offset']);
      if (!offset) continue;
      let touched = false;
      for (const axis of ['x', 'y'] as const) {
        const value = offset[axis];
        if (typeof value !== 'number') continue;
        offset[axis] = convertValue(value);
        touched = true;
      }
      if (touched) changed = true;
    }
  }

  return changed;
}

/** 该行配置视觉参数时用的格子大小：作者的 `cellSize`，否则基准格子。 */
function cellSizeOf(style: Record<string, unknown>): number {
  const value = style['cellSize'];
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  return BASE_CELL;
}

function toPercent(pixels: number, cellSize: number): number {
  return Math.round((pixels / cellSize) * 100);
}

function toPixels(percent: number, cellSize: number): number {
  return Math.round((percent / 100) * cellSize);
}

/** `BASE_CELL`（`packages/shared/src/constants/grid.ts`）—— 迁移里内联，避免依赖运行时常量。 */
const BASE_CELL = 120;

function asObject(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
