import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAP_STYLE,
  MAP_STYLE_DIFF_GROUPS,
  MAP_STYLE_FIELDS,
  mapStyleSchema,
  type MapStyle,
} from '@loredoku/shared';
import {
  THEME_STYLE_FIELDS,
  THEME_STYLE_GROUP_HINTS,
  isValidThemeStyle,
  resetThemeStyle,
  writeStyleValue,
} from './themeStyleFields';

/**
 * v0.8.3：概览页「地图初始样式」表单的字段表。
 *
 * 这里只钉两件在别处看不出来的事：
 *
 * 1. 字段表是 `MAP_STYLE_FIELDS` 的**派生**，不是抄本 —— 那边加一项而这边没写
 *    「怎么改」，`kind` 会落成 `unknown`，这条断言当场红，而不是界面上少一行；
 * 2. `writeStyleValue` 只改目标那一层，兄弟字段原样保留（手写展开最容易在这里出错）。
 *
 * v0.8.6 §1：`cellSize` 从表单里拿掉了，于是「一一对应」变成「是同序的子序列」——
 * 但**不能**变成「随便缺几项都行」：这里同时钉住唯一的例外就是它。
 */

describe('THEME_STYLE_FIELDS', () => {
  it('是 shared 字段表同序的子序列 —— 唯一少的是方格大小', () => {
    const keys = THEME_STYLE_FIELDS.map((field) => field.key);
    expect(keys).toEqual(
      MAP_STYLE_FIELDS.filter((field) => field.key !== 'cellSize').map((field) => field.key),
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

  it('格式化与差异弹窗同一套写法：线宽带 px，方格大小仍是「自适应」', () => {
    const width = THEME_STYLE_FIELDS.find((field) => field.key === 'gridSeparator.width');
    expect(width?.format(DEFAULT_MAP_STYLE)).toBe(`${DEFAULT_MAP_STYLE.gridSeparator.width}px`);

    /**
     * 方格大小不在概览页表单里了，但**差异弹窗仍然列它** —— 地图「基本信息」里
     * 那一项还是作者要改的，跟主题比对时不能装作没这项。
     */
    const cellSize = MAP_STYLE_FIELDS.find((field) => field.key === 'cellSize');
    expect(cellSize?.format?.(cellSize.read(DEFAULT_MAP_STYLE))).toBe('自适应');
  });

  /**
   * v0.8.6 §1.6：弹窗照抽屉的骨架重排，每个字段后面跟着一个问号。问号的内容来自
   * 这张表 —— 漏一条不会报错，界面上只是那一行没有解释，比「多写一行」更难发现。
   */
  it('每一项都带一句解释，四组都有组解释', () => {
    expect(THEME_STYLE_FIELDS.filter((field) => !field.hint).map((field) => field.key)).toEqual([]);
    expect(MAP_STYLE_DIFF_GROUPS.filter((group) => !THEME_STYLE_GROUP_HINTS[group])).toEqual([]);
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

  it('改别的字段时，不在表单里的方格大小原样带着', () => {
    const withCell = { ...DEFAULT_MAP_STYLE, cellSize: 48 };
    const next = writeStyleValue(withCell, 'gridSeparator.width', 6);
    expect(next.cellSize).toBe(48);
    expect(next.gridSeparator.width).toBe(6);
  });
});

describe('resetThemeStyle（v0.8.6 §1）', () => {
  /**
   * 「恢复默认」原来是一句 `setStyle(DEFAULT_MAP_STYLE)` —— 那会把 `cellSize`
   * 也拨回 `null`。方格大小已经不在清单上，作者按了「恢复默认」，看不见的那一项
   * 被改掉了，保存后新地图就不再是原来那个格子尺寸。
   */
  it('把看得见的字段拨回出厂值，看不见的方格大小不动', () => {
    const mine: MapStyle = {
      ...DEFAULT_MAP_STYLE,
      cellSize: 48,
      gridSeparator: { width: 9, color: '#000000' },
    };
    const next = resetThemeStyle(mine);
    expect(next.cellSize).toBe(48);
    expect(next.gridSeparator).toEqual(DEFAULT_MAP_STYLE.gridSeparator);
  });
});
