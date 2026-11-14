import { describe, expect, it } from 'vitest';
import {
  BASE_CELL,
  DEFAULT_LINKAGE_COLORS,
  DEFAULT_MAP_STYLE,
  HIGHLIGHT_BLUE,
  HIGHLIGHT_RED,
  LINKAGE_COLOR_MAX_COUNT,
  LINKAGE_COLOR_MIN_COUNT,
  MAP_STYLE_CELL_SIZE_MAX,
  MAP_STYLE_CELL_SIZE_MIN,
  MAP_STYLE_LINE_WIDTH_MAX,
  MAP_STYLE_LINE_WIDTH_MIN,
  MAX_CELL_SIZE,
  MIN_CELL_SIZE,
  STYLE_DEFAULT_REGION_HIGHLIGHT_COLOR,
  type CharacterSlotEntry,
  type MapLinkageColor,
  type MapStyle,
} from '@loredoku/shared';
import {
  canvasShadowStyle,
  clampCellSize,
  clampLineWidth,
  clampRulerFontSize,
  clampRulerGap,
  itemOutlineFilter,
  mapStyleEquals,
  clampOperationOffset,
  clampRegionBorderWidth,
  clampRegionLabelFont,
  clampRegionLabelStroke,
  countLinkageColorUsage,
  effectiveCellSize,
  isValidShadowColor,
  isValidStyleColor,
  linkageColorFor,
  linkageLabelFor,
  nextLinkageKey,
  resolveLinkageColors,
  resolveMapStyle,
  retargetLinkageColors,
  styleLineWidth,
} from './mapStyle';

const slot = (linkages: CharacterSlotEntry['linkages']): CharacterSlotEntry => ({
  characterId: 1,
  themeColor: '#FFFFFF',
  clue: '',
  linkages,
});

describe('resolveMapStyle (FEAT-D02)', () => {
  it('falls back to the shipped defaults for a pre-v0.3.8 draft', () => {
    expect(resolveMapStyle(undefined)).toEqual(DEFAULT_MAP_STYLE);
    expect(resolveMapStyle(null)).toEqual(DEFAULT_MAP_STYLE);
  });

  it('SPEC-M07: ships the new 基本信息 defaults', () => {
    const style = resolveMapStyle(undefined);
    expect(style.cellSize).toBeNull();
    // §7 新默认值逐项钉住。
    expect(style.canvasFrame).toEqual({ width: 12, color: '#000000' });
    expect(style.gridSeparator).toEqual({ width: 4, color: '#000000' });
    expect(style.mouseCursorBox.width).toBe(8);
    expect(style.mouseCursorBox.color).toBe('#FFFFFF');
    expect(style.mouseCursorBox.blockedColor).toBe(HIGHLIGHT_RED);
    expect(style.operationCursorBox.width).toBe(8);
    expect(style.operationCursorBox.color).toBe(HIGHLIGHT_BLUE);
    expect(style.regionOutline).toEqual({ width: 12, color: DEFAULT_MAP_STYLE.regionOutline.color });
    expect(style.regionHighlight).toEqual({
      width: 12,
      color: STYLE_DEFAULT_REGION_HIGHLIGHT_COLOR,
    });
    expect(style.regionLabel.fontSize).toBe(32);
    expect(style.regionLabel.strokeWidth).toBe(10);
    // §2: the hovered label is the **larger** one.
    expect(style.regionLabel.hoverFontSize).toBe(36);
    expect(style.regionLabel.hoverFontSize).toBeGreaterThan(style.regionLabel.fontSize);
    expect(style.regionLabel.hoverStrokeColor).toBe(STYLE_DEFAULT_REGION_HIGHLIGHT_COLOR);
    expect(style.ruler).toEqual({ fontSize: 24, gap: 24 });
    // v0.5.0 FEAT-K14: the palette left `MapStyle` — see the puzzle section.
    expect(style).not.toHaveProperty('linkageColors');
  });

  it('FIX-M02: never lets the hovered label be smaller than the idle one', () => {
    const style = resolveMapStyle({
      regionLabel: { fontSize: 30, hoverFontSize: 12 },
    } as Partial<MapStyle>);
    expect(style.regionLabel.fontSize).toBe(30);
    expect(style.regionLabel.hoverFontSize).toBe(30);
    // A sensible hover size is left alone.
    const bigger = resolveMapStyle({
      regionLabel: { fontSize: 10, hoverFontSize: 20 },
    } as Partial<MapStyle>);
    expect(bigger.regionLabel.hoverFontSize).toBe(20);
  });

  it('clamps every numeric field into its documented range', () => {
    const style = resolveMapStyle({
      cellSize: 5000,
      canvasFrame: { width: 99, color: '#123456' },
      gridSeparator: { width: 0 },
      regionHighlight: { width: -4 },
      regionOutline: { width: 40 },
      operationCursorBox: { offset: 999 },
      regionLabel: { fontSize: 400, strokeWidth: 99 },
    } as Partial<MapStyle>);
    expect(style.cellSize).toBe(MAP_STYLE_CELL_SIZE_MAX);
    expect(style.canvasFrame.width).toBe(MAP_STYLE_LINE_WIDTH_MAX);
    expect(style.canvasFrame.color).toBe('#123456');
    expect(style.gridSeparator.width).toBe(MAP_STYLE_LINE_WIDTH_MIN);
    expect(style.regionHighlight.width).toBe(MAP_STYLE_LINE_WIDTH_MIN);
    // Region outlines have their own 4 ~ 12 range.
    expect(style.regionOutline.width).toBe(12);
    // v0.10.7：外扩距离的区间是 0 ~ 100（格的百分比）。
    expect(style.operationCursorBox.offset).toBe(100);
    expect(style.regionLabel.fontSize).toBe(48);
    expect(style.regionLabel.strokeWidth).toBe(12);
  });

  it('rejects malformed colours and keeps the default', () => {
    const style = resolveMapStyle({
      gridSeparator: { color: 'red' },
      canvasFrame: { color: '#GGGGGG' },
    } as Partial<MapStyle>);
    expect(style.gridSeparator.color).toBe(DEFAULT_MAP_STYLE.gridSeparator.color);
    expect(style.canvasFrame.color).toBe(DEFAULT_MAP_STYLE.canvasFrame.color);
  });

  it('accepts an rgb/rgba shadow ring but not an arbitrary string', () => {
    expect(isValidShadowColor('rgba(0,0,0,0.15)')).toBe(true);
    expect(isValidShadowColor('#000000')).toBe(true);
    expect(isValidShadowColor('nope')).toBe(false);
    const style = resolveMapStyle({
      mouseCursorBox: { shadowColor: 'rgba(10,20,30,0.4)' },
    } as Partial<MapStyle>);
    expect(style.mouseCursorBox.shadowColor).toBe('rgba(10,20,30,0.4)');
  });

  it('treats a non-finite cell size as "adaptive"', () => {
    expect(resolveMapStyle({ cellSize: Number.NaN } as Partial<MapStyle>).cellSize).toBeNull();
    expect(resolveMapStyle({ cellSize: 123.4 } as Partial<MapStyle>).cellSize).toBe(123);
  });
});

describe('clamp helpers (FEAT-D02 §关键规则 6)', () => {
  it('clamps each field to its own range', () => {
    expect(clampLineWidth(-1)).toBe(MAP_STYLE_LINE_WIDTH_MIN);
    expect(clampLineWidth(999)).toBe(MAP_STYLE_LINE_WIDTH_MAX);
    expect(clampRegionLabelFont(4)).toBe(9);
    expect(clampRegionLabelFont(999)).toBe(48);
    expect(clampRegionLabelFont(17.6)).toBe(18);
    expect(clampRegionLabelStroke(-3)).toBe(0);
    // v0.10.7：外扩距离改成格的百分比，上限 100。
    expect(clampOperationOffset(200)).toBe(100);
    // v0.7.4: 轮廓线下限 4 → 1，0 仍然被夹到 1。
    expect(clampRegionBorderWidth(0)).toBe(1);
    expect(clampRegionBorderWidth(1)).toBe(1);
    expect(clampRegionBorderWidth(99)).toBe(12);
    expect(clampCellSize(10)).toBe(MIN_CELL_SIZE);
    expect(clampCellSize(10_000)).toBe(MAX_CELL_SIZE);
    expect(clampCellSize(122.6)).toBe(123);
  });

  it('rejects non-hex colours', () => {
    expect(isValidStyleColor('#a1b2c3')).toBe(true);
    expect(isValidStyleColor('#FFF')).toBe(false);
    expect(isValidStyleColor('rgb(1,2,3)')).toBe(false);
  });
});

describe('linkage palette (FEAT-D04)', () => {
  it('ships at least red and blue by default', () => {
    expect(DEFAULT_LINKAGE_COLORS.map((entry) => entry.key)).toEqual(['red', 'blue']);
    expect(LINKAGE_COLOR_MIN_COUNT).toBe(2);
  });

  it('drops malformed entries and never re-adds a removed colour', () => {
    const resolved = resolveLinkageColors([
      { key: 'red', label: '红', color: '#EF9A9A' },
      { key: 'BadKey', label: 'x', color: '#000000' },
      { key: 'nope', label: 'x', color: 'not-a-colour' },
    ] as MapLinkageColor[]);
    // The 2-entry minimum is a schema / UI invariant — resolving must not
    // resurrect a colour the user deleted.
    expect(resolved.map((entry) => entry.key)).toEqual(['red']);
  });

  it('falls back to the shipped palette when nothing usable is left', () => {
    expect(resolveLinkageColors([]).map((entry) => entry.key)).toEqual(['red', 'blue']);
    expect(resolveLinkageColors(null).map((entry) => entry.key)).toEqual(['red', 'blue']);
  });

  it('de-duplicates keys (first wins) and caps the list', () => {
    const many: MapLinkageColor[] = Array.from({ length: 20 }, (_, index) => ({
      key: `k${index}`,
      label: `k${index}`,
      color: '#123456',
    }));
    expect(resolveLinkageColors(many)).toHaveLength(LINKAGE_COLOR_MAX_COUNT);
    const duplicated = resolveLinkageColors([
      { key: 'a', label: 'A', color: '#111111' },
      { key: 'a', label: 'B', color: '#222222' },
    ] as MapLinkageColor[]);
    expect(duplicated.find((entry) => entry.key === 'a')?.label).toBe('A');
  });

  it('resolves a key to its hex, falling back to the first entry', () => {
    // v0.5.0 FEAT-K14: the lookups take the palette itself (the puzzle owns it).
    const palette = resolveLinkageColors([
      { key: 'red', label: '红', color: '#FF0000' },
      { key: 'blue', label: '蓝', color: '#0000FF' },
      { key: 'green', label: '绿', color: '#00FF00' },
    ] as MapLinkageColor[]);
    expect(linkageColorFor(palette, 'green')).toBe('#00FF00');
    expect(linkageLabelFor(palette, 'green')).toBe('绿');
    expect(linkageColorFor(palette, 'missing')).toBe('#FF0000');
    expect(linkageLabelFor(palette, 'missing')).toBe('红');
    // An empty palette still answers with the shipped first colour.
    expect(linkageColorFor([], 'missing')).toBe(DEFAULT_LINKAGE_COLORS[0]!.color);
  });

  it('hands out an unused, well-formed key for a new entry', () => {
    const key = nextLinkageKey([{ key: 'red', label: '红', color: '#EF9A9A' }]);
    expect(key).toBe('c2');
    // `c2` is taken → the next free key is handed out.
    expect(nextLinkageKey([{ key: 'c2', label: 'x', color: '#000000' }])).toBe('c3');
  });

  it('re-points every linkage when a palette entry is removed', () => {
    const slots = [
      slot([
        { type: 'cell', cells: [[0, 0]], effect: 'highlight', color: 'blue' },
        { type: 'region', id: 'rg_a', effect: 'highlight', color: 'red' },
      ]),
      null,
      slot([{ type: 'character', id: 2, effect: 'highlight', color: 'blue' }]),
    ];
    const next = retargetLinkageColors(slots, 'blue', 'red');
    expect(next[0]?.linkages?.map((entry) => entry.color)).toEqual(['red', 'red']);
    expect(next[2]?.linkages?.map((entry) => entry.color)).toEqual(['red']);
    // Untouched entries keep their identity.
    expect(next[1]).toBeNull();
    expect(retargetLinkageColors(slots, 'red', 'red')).toBe(slots);
  });

  it('counts how many linkages use a key (drives the delete confirm)', () => {
    const slots = [
      slot([
        { type: 'cell', cells: [[0, 0]], effect: 'highlight', color: 'blue' },
        { type: 'cell', cells: [[1, 1]], effect: 'highlight', color: 'blue' },
      ]),
      null,
    ];
    expect(countLinkageColorUsage(slots, 'blue')).toBe(2);
    expect(countLinkageColorUsage(slots, 'red')).toBe(0);
  });
});

describe('cell size override (FEAT-D03, v0.10.3 降级为上限)', () => {
  it('uses the adaptive value while the override is null', () => {
    const style = resolveMapStyle(undefined);
    expect(effectiveCellSize(123, style)).toBe(123);
  });

  it('v0.10.3: 作者值只压上限 —— 比自适应值大时仍按自适应值渲染', () => {
    const style = resolveMapStyle({ cellSize: 200 } as Partial<MapStyle>);
    // 作者写的 200 装不下（自适应只算出 123），渲染取小的那个。
    expect(effectiveCellSize(123, style)).toBe(123);
    // 屏变大、自适应长到 300 时，作者那句「别超过 200」仍然有效。
    expect(effectiveCellSize(300, style)).toBe(200);
    // 自适应比作者值小时一律听自适应。
    expect(effectiveCellSize(90, style)).toBe(90);
    expect(MAP_STYLE_CELL_SIZE_MIN).toBe(MIN_CELL_SIZE);
    expect(MAP_STYLE_CELL_SIZE_MAX).toBe(MAX_CELL_SIZE);
  });
});

describe('styleLineWidth (FEAT-D02 §关键规则 1)', () => {
  it('scales from BASE_CELL and clamps like every other line', () => {
    expect(styleLineWidth(2, BASE_CELL)).toBe(2);
    expect(styleLineWidth(2, 240)).toBe(4);
    expect(styleLineWidth(2, 90)).toBeCloseTo(1.5, 6);
    // 12 × 2 = 24 → clamped to the 12px ceiling.
    expect(styleLineWidth(12, 240)).toBe(12);
  });
});

describe('canvas shadow (v0.8.7 §6 / v0.9.1 §2 / v0.10.7 百分比)', () => {
  it('出厂 30%、墨黑 0.3 的右下硬影（120px 格子上还是 36px）', () => {
    const style = resolveMapStyle(undefined);
    // 0 模糊，x 与 y 用同一个偏移，别让影子歪掉；透明度取常量。
    expect(canvasShadowStyle(style, 120).boxShadow).toBe('36px 36px 0 rgba(0, 0, 0, 0.3)');
  });

  it('偏移与颜色读 canvasShadow，与画布外框解耦', () => {
    const style = resolveMapStyle({
      // 外框染红也不该把影子带红 —— 这是 v0.9.1 拆开它们的重点。
      canvasFrame: { width: 12, color: '#FF0000' },
      canvasShadow: { offset: 40, color: '#2F2A24' },
    } as Partial<MapStyle>);
    expect(canvasShadowStyle(style, 120).boxShadow).toBe('48px 48px 0 rgba(47, 42, 36, 0.3)');
  });

  it('v0.10.7：偏移按方格大小的百分比算，格子变大影子跟着按比例走', () => {
    const style = resolveMapStyle({
      canvasShadow: { offset: 50, color: '#000000' },
    } as Partial<MapStyle>);
    expect(canvasShadowStyle(style, 120).boxShadow).toBe('60px 60px 0 rgba(0, 0, 0, 0.3)');
    expect(canvasShadowStyle(style, 60).boxShadow).toBe('30px 30px 0 rgba(0, 0, 0, 0.3)');
    // 同一比例：30/60 与 60/120 都是半格。
    expect(canvasShadowStyle(style, 200).boxShadow).toBe('100px 100px 0 rgba(0, 0, 0, 0.3)');
  });

  it('偏移量被夹在 0 ~ 200 的区间里', () => {
    expect(resolveMapStyle({ canvasShadow: { offset: -10, color: '#000000' } } as Partial<MapStyle>).canvasShadow.offset).toBe(0);
    expect(resolveMapStyle({ canvasShadow: { offset: 999, color: '#000000' } } as Partial<MapStyle>).canvasShadow.offset).toBe(200);
  });
});

describe('item outline (v0.9.1 §5)', () => {
  it('出厂宽度 0，filter 为 undefined（不描边）', () => {
    const style = resolveMapStyle(undefined);
    expect(style.itemOutline.width).toBe(0);
    expect(itemOutlineFilter(style.itemOutline, BASE_CELL)).toBeUndefined();
  });

  it('宽度 > 0：4 向 drop-shadow，颜色取配置，宽度按方格缩放', () => {
    const style = resolveMapStyle({
      itemOutline: { width: 6, color: '#2F2A24' },
    } as Partial<MapStyle>);
    const filter = itemOutlineFilter(style.itemOutline, BASE_CELL);
    expect(filter?.match(/drop-shadow/g)).toHaveLength(4);
    expect(filter?.match(/#2F2A24/g)).toHaveLength(4);
    // cellSize = BASE_CELL 时基准值不缩放。
    expect(filter).toContain('6px');
  });

  it('宽度被夹在 0 ~ 12 的区间里', () => {
    expect(resolveMapStyle({ itemOutline: { width: -3, color: '#000000' } } as Partial<MapStyle>).itemOutline.width).toBe(0);
    expect(resolveMapStyle({ itemOutline: { width: 99, color: '#000000' } } as Partial<MapStyle>).itemOutline.width).toBe(12);
  });
});

// ---- v0.3.9 SPEC-E01: 规范图层命名 ----
describe('layer naming (SPEC-E01)', () => {
  it('exposes the规范 field names', () => {
    const style = resolveMapStyle(undefined);
    // v0.5.2 SPEC-M07 defaults.
    expect(style.canvasFrame).toEqual({ width: 12, color: '#000000' });
    expect(style.gridSeparator).toEqual({ width: 4, color: '#000000' });
    expect(style.mouseCursorBox.width).toBe(8);
    expect(style.operationCursorBox.offset).toBe(1);
    expect(style.regionOutline).toEqual({ width: 12, color: '#000000' });
    expect(style.regionHighlight).toEqual({
      width: 12,
      color: STYLE_DEFAULT_REGION_HIGHLIGHT_COLOR,
    });
  });

  it('ignores the pre-v0.3.9 field names', () => {
    const legacy = {
      border: { width: 9, color: '#FF0000' },
      regionBorder: { width: 12 },
      mouseCursor: { width: 11 },
    } as unknown as Partial<MapStyle>;
    const style = resolveMapStyle(legacy);
    // Unknown keys fall through to the defaults instead of half-applying.
    expect(style.gridSeparator).toEqual(DEFAULT_MAP_STYLE.gridSeparator);
    expect(style.regionOutline).toEqual(DEFAULT_MAP_STYLE.regionOutline);
    expect(style.mouseCursorBox).toEqual(DEFAULT_MAP_STYLE.mouseCursorBox);
  });
});

// ---- v0.3.9 FEAT-E02: 标尺文本大小与间距 ----
describe('ruler style (FEAT-E02)', () => {
  it('SPEC-M07: defaults to 24px / 24px', () => {
    expect(resolveMapStyle(undefined).ruler).toEqual({ fontSize: 24, gap: 24 });
  });

  it('clamps the text size and the gap', () => {
    expect(resolveMapStyle({ ruler: { fontSize: 2 } } as Partial<MapStyle>).ruler.fontSize).toBe(9);
    expect(resolveMapStyle({ ruler: { fontSize: 99 } } as Partial<MapStyle>).ruler.fontSize).toBe(32);
    expect(resolveMapStyle({ ruler: { gap: -4 } } as Partial<MapStyle>).ruler.gap).toBe(0);
    expect(resolveMapStyle({ ruler: { gap: 99 } } as Partial<MapStyle>).ruler.gap).toBe(32);
  });

  it('rounds the text size to whole pixels', () => {
    expect(resolveMapStyle({ ruler: { fontSize: 17.6 } } as Partial<MapStyle>).ruler.fontSize).toBe(18);
  });

  it('provides dedicated clamp helpers for the form', () => {
    expect(clampRulerFontSize(3)).toBe(9);
    expect(clampRulerFontSize(31.4)).toBe(31);
    expect(clampRulerFontSize(999)).toBe(32);
    expect(clampRulerGap(-1)).toBe(0);
    expect(clampRulerGap(40)).toBe(32);
  });
});

// ---- v0.3.9 FEAT-E01: 草稿比较 ----
describe('mapStyleEquals (FEAT-E01)', () => {
  it('treats two independently resolved defaults as equal', () => {
    expect(mapStyleEquals(resolveMapStyle(undefined), resolveMapStyle(undefined))).toBe(true);
  });

  it('detects any difference between two resolved styles', () => {
    const base = resolveMapStyle(undefined);
    expect(
      mapStyleEquals(base, resolveMapStyle({ gridSeparator: { width: 3 } } as Partial<MapStyle>)),
    ).toBe(false);
    expect(
      mapStyleEquals(base, resolveMapStyle({ ruler: { gap: 7 } } as Partial<MapStyle>)),
    ).toBe(false);
    // v0.5.0 FEAT-K14: the palette left `MapStyle`, so a resolved style carries
    // no `linkageColors` field for the comparison to trip over.
    expect(base).not.toHaveProperty('linkageColors');
  });

  it('is a cheap identity check for the same object', () => {
    const style = resolveMapStyle(undefined);
    expect(mapStyleEquals(style, style)).toBe(true);
  });
});
