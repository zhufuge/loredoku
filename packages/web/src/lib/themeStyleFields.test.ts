import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAP_STYLE,
  MAP_STYLE_FIELDS,
  mapStyleSchema,
  type MapStyle,
} from '@loredoku/shared';
import { THEME_STYLE_FIELDS, isValidThemeStyle, writeStyleValue } from './themeStyleFields';

/**
 * v0.8.3：概览页「缺省风格」表单的字段表。
 *
 * 这里只钉两件在别处看不出来的事：
 *
 * 1. 字段表是 `MAP_STYLE_FIELDS` 的**派生**，不是抄本 —— 那边加一项而这边没写
 *    「怎么改」，`kind` 会落成 `unknown`，这条断言当场红，而不是界面上少一行；
 * 2. `writeStyleValue` 只改目标那一层，兄弟字段原样保留（手写展开最容易在这里出错）。
 */

describe('THEME_STYLE_FIELDS', () => {
  it('与 shared 的字段表一一对应，顺序也一致', () => {
    expect(THEME_STYLE_FIELDS.map((field) => field.key)).toEqual(
      MAP_STYLE_FIELDS.map((field) => field.key),
    );
  });

  it('每一项都知道怎么改 —— 没有 unknown', () => {
    const unknown = THEME_STYLE_FIELDS.filter((field) => field.kind === 'unknown');
    expect(unknown.map((field) => field.key)).toEqual([]);
  });

  it('数字字段都带区间，颜色字段不带', () => {
    for (const field of THEME_STYLE_FIELDS) {
      if (field.kind === 'number') {
        expect(field.min, field.key).toBeTypeOf('number');
        expect(field.max, field.key).toBeTypeOf('number');
      }
      if (field.kind !== 'number') {
        expect(field.min, field.key).toBeUndefined();
      }
    }
  });

  it('格式化与差异弹窗同一套写法：线宽带 px，方格大小可以是「自适应」', () => {
    const width = THEME_STYLE_FIELDS.find((field) => field.key === 'gridSeparator.width');
    expect(width?.format(DEFAULT_MAP_STYLE)).toBe(`${DEFAULT_MAP_STYLE.gridSeparator.width}px`);

    const cellSize = THEME_STYLE_FIELDS.find((field) => field.key === 'cellSize');
    expect(cellSize?.format(DEFAULT_MAP_STYLE)).toBe('自适应');
  });
});

describe('writeStyleValue', () => {
  it('改一层，兄弟字段全部原样保留', () => {
    const next = writeStyleValue(DEFAULT_MAP_STYLE, 'gridSeparator.width', 4);
    expect(next.gridSeparator.width).toBe(4);
    expect(next.gridSeparator.color).toBe(DEFAULT_MAP_STYLE.gridSeparator.color);
    expect(next.canvasFrame).toEqual(DEFAULT_MAP_STYLE.canvasFrame);
    expect(next.regionLabel).toEqual(DEFAULT_MAP_STYLE.regionLabel);
  });

  it('不改原对象（草稿是草稿，主题是主题）', () => {
    const before = DEFAULT_MAP_STYLE.gridSeparator.width;
    writeStyleValue(DEFAULT_MAP_STYLE, 'gridSeparator.width', 9);
    expect(DEFAULT_MAP_STYLE.gridSeparator.width).toBe(before);
  });

  it('写三层的字段也对（区域标签的悬停描边）', () => {
    const next = writeStyleValue(DEFAULT_MAP_STYLE, 'regionLabel.hoverStrokeWidth', 6);
    expect(next.regionLabel.hoverStrokeWidth).toBe(6);
    expect(next.regionLabel.hoverColor).toBe(DEFAULT_MAP_STYLE.regionLabel.hoverColor);
  });

  it('写出来的结果仍然是合法风格 —— 表单不会把半截值交给服务端', () => {
    let style: MapStyle = DEFAULT_MAP_STYLE;
    for (const field of THEME_STYLE_FIELDS) {
      if (field.kind === 'number' && field.key !== 'cellSize') {
        style = writeStyleValue(style, field.key, field.min as number);
      }
    }
    expect(isValidThemeStyle(style)).toBe(true);
    expect(mapStyleSchema.safeParse(style).success).toBe(true);
  });

  it('方格大小可以写回 null（自适应）', () => {
    const explicit = writeStyleValue(DEFAULT_MAP_STYLE, 'cellSize', 48);
    expect(explicit.cellSize).toBe(48);
    expect(writeStyleValue(explicit, 'cellSize', null).cellSize).toBeNull();
  });
});
