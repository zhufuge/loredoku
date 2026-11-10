import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAP_STYLE,
  DEFAULT_REGION_LABEL_FONT_FAMILY,
  MAP_STYLE_FONT_FAMILY_KEYS,
  MAP_STYLE_FONT_FAMILY_STACKS,
  MAP_STYLE_REGION_LABEL_STROKE_MAX,
  REGION_BORDER_WIDTH_MAX,
  REGION_BORDER_WIDTH_MIN,
  STYLE_DEFAULT_REGION_LABEL_HOVER_STROKE_WIDTH,
  fontFamilyStack,
  isMapStyleFontFamilyKey,
} from '../constants';
import {
  createRegionInputSchema,
  draftRegionSchema,
  mapStyleSchema,
  regionStyleOverrideSchema,
  updateRegionInputSchema,
} from './mapDraft';

describe('mapStyleSchema 区域标签描边 (v0.7.0)', () => {
  it('fills hoverStrokeWidth from the shipped default', () => {
    const parsed = mapStyleSchema.parse({});
    expect(parsed.regionLabel.hoverStrokeWidth).toBe(STYLE_DEFAULT_REGION_LABEL_HOVER_STROKE_WIDTH);
  });

  it('accepts an explicit hoverStrokeWidth within bounds', () => {
    const parsed = mapStyleSchema.parse({ regionLabel: { hoverStrokeWidth: 3 } });
    expect(parsed.regionLabel.hoverStrokeWidth).toBe(3);
    expect(mapStyleSchema.safeParse({ regionLabel: { hoverStrokeWidth: 99 } }).success).toBe(false);
    expect(
      mapStyleSchema.safeParse({ regionLabel: { hoverStrokeWidth: MAP_STYLE_REGION_LABEL_STROKE_MAX } })
        .success,
    ).toBe(true);
  });
});

describe('regionStyleOverrideSchema (v0.7.0)', () => {
  it('accepts a deep partial — every group optional, every field optional', () => {
    const result = regionStyleOverrideSchema.safeParse({
      outline: { width: 8 },
      label: { hoverStrokeWidth: 2, color: '#112233' },
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.outline).toEqual({ width: 8 });
    expect(result.data.highlight).toBeUndefined();
  });

  it('accepts an empty object (nothing overridden)', () => {
    expect(regionStyleOverrideSchema.safeParse({}).success).toBe(true);
  });

  it('rejects unknown keys inside each group', () => {
    expect(regionStyleOverrideSchema.safeParse({ outline: { color: '#000000', nope: 1 } }).success).toBe(
      false,
    );
    expect(regionStyleOverrideSchema.safeParse({ highlight: { width: 4, fillOpacity: 0.5 } }).success).toBe(
      false,
    );
    expect(regionStyleOverrideSchema.safeParse({ label: { nope: 1 } }).success).toBe(false);
    expect(regionStyleOverrideSchema.safeParse({ fill: {} }).success).toBe(false);
  });

  it('keeps the map-level bounds per group', () => {
    expect(regionStyleOverrideSchema.safeParse({ outline: { width: REGION_BORDER_WIDTH_MIN } }).success).toBe(
      true,
    );
    expect(regionStyleOverrideSchema.safeParse({ outline: { width: REGION_BORDER_WIDTH_MAX } }).success).toBe(
      true,
    );
    // v0.7.4: 轮廓线下限降到 1，0 仍然不合法。
    expect(regionStyleOverrideSchema.safeParse({ outline: { width: 0 } }).success).toBe(false);
    expect(regionStyleOverrideSchema.safeParse({ outline: { width: 8.5 } }).success).toBe(false);
    expect(regionStyleOverrideSchema.safeParse({ highlight: { width: 1.5 } }).success).toBe(true);
    expect(regionStyleOverrideSchema.safeParse({ highlight: { width: 99 } }).success).toBe(false);
    expect(regionStyleOverrideSchema.safeParse({ label: { fontSize: 9.5 } }).success).toBe(false);
  });

  it('requires #RRGGBB colours', () => {
    expect(regionStyleOverrideSchema.safeParse({ outline: { color: '#A1B2C3' } }).success).toBe(true);
    expect(regionStyleOverrideSchema.safeParse({ outline: { color: 'red' } }).success).toBe(false);
    expect(regionStyleOverrideSchema.safeParse({ label: { hoverStrokeColor: '#fff' } }).success).toBe(false);
  });
});

describe('draftRegionSchema (v0.7.0)', () => {
  const base = { id: 'rg_1', name: '门厅', cells: [[0, 0]] };

  it('accepts a region without any style block', () => {
    const result = draftRegionSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.style).toBeUndefined();
    expect('color' in result.data).toBe(false);
    expect('borderWidth' in result.data).toBe(false);
    expect('fillOpacity' in result.data).toBe(false);
  });

  it('accepts a style block', () => {
    const result = draftRegionSchema.safeParse({
      ...base,
      style: {
        outline: { width: 10, color: '#123456' },
        highlight: { width: 6, color: '#3B82F6' },
        label: { fontSize: 20, hoverStrokeWidth: 4 },
      },
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.style?.outline?.width).toBe(10);
    expect(result.data.style?.label?.hoverStrokeWidth).toBe(4);
  });

  it('rejects the v0.6.x flat trio (schema stays strict)', () => {
    expect(draftRegionSchema.safeParse({ ...base, color: '#000000' }).success).toBe(false);
    expect(draftRegionSchema.safeParse({ ...base, borderWidth: 6 }).success).toBe(false);
    expect(draftRegionSchema.safeParse({ ...base, fillOpacity: 0 }).success).toBe(false);
  });

  it('keeps requiring at least one cell and a non-empty name', () => {
    expect(draftRegionSchema.safeParse({ ...base, cells: [] }).success).toBe(false);
    expect(draftRegionSchema.safeParse({ ...base, name: '  ' }).success).toBe(false);
  });

  it('feeds the create / update input schemas', () => {
    expect(createRegionInputSchema.safeParse({ name: '门厅', cells: [[0, 0]] }).success).toBe(true);
    expect(updateRegionInputSchema.safeParse({ style: { outline: { width: 8 } } }).success).toBe(true);
    expect(updateRegionInputSchema.safeParse({ color: '#000000' }).success).toBe(false);
  });
});

describe('DEFAULT_MAP_STYLE (v0.7.0)', () => {
  it('carries a hover stroke width that matches the idle stroke width', () => {
    expect(DEFAULT_MAP_STYLE.regionLabel.hoverStrokeWidth).toBe(
      DEFAULT_MAP_STYLE.regionLabel.strokeWidth,
    );
  });
});

describe('区域标签字体 (v0.7.4)', () => {
  it('fills fontFamily from the shipped default', () => {
    expect(mapStyleSchema.parse({}).regionLabel.fontFamily).toBe(
      DEFAULT_REGION_LABEL_FONT_FAMILY,
    );
    expect(DEFAULT_REGION_LABEL_FONT_FAMILY).toBe('system');
  });

  it('accepts the built-in keys and keeps their stacks', () => {
    for (const key of MAP_STYLE_FONT_FAMILY_KEYS) {
      expect(mapStyleSchema.parse({ regionLabel: { fontFamily: key } }).regionLabel.fontFamily).toBe(
        key,
      );
      expect(
        regionStyleOverrideSchema.safeParse({ label: { fontFamily: key } }).success,
        key,
      ).toBe(true);
      expect(fontFamilyStack(key)).toBe(MAP_STYLE_FONT_FAMILY_STACKS[key]);
    }
  });

  it('accepts a concrete font name and quotes it in front of the system stack', () => {
    for (const name of ['WenKai', 'Noto Serif SC', '霞鹜文楷', 'LXGW-WenKai']) {
      expect(mapStyleSchema.parse({ regionLabel: { fontFamily: name } }).regionLabel.fontFamily).toBe(
        name,
      );
      expect(regionStyleOverrideSchema.safeParse({ label: { fontFamily: name } }).success).toBe(
        true,
      );
      expect(fontFamilyStack(name).startsWith(`"${name}", `)).toBe(true);
      expect(fontFamilyStack(name).endsWith(MAP_STYLE_FONT_FAMILY_STACKS.system)).toBe(true);
    }
  });

  it('trims the name before storing it', () => {
    expect(
      mapStyleSchema.parse({ regionLabel: { fontFamily: '  WenKai  ' } }).regionLabel.fontFamily,
    ).toBe('WenKai');
  });

  it('rejects names that could break out of the CSS fallback chain', () => {
    for (const bad of ['', '   ', 'a;b', 'a,b', 'a"b', 'a(b)', 'a}b', 'x'.repeat(65)]) {
      expect(mapStyleSchema.safeParse({ regionLabel: { fontFamily: bad } }).success, bad).toBe(
        false,
      );
      expect(regionStyleOverrideSchema.safeParse({ label: { fontFamily: bad } }).success, bad).toBe(
        false,
      );
    }
  });

  it('falls back to the default stack for a name it cannot quote safely', () => {
    expect(fontFamilyStack('a;b')).toBe(
      MAP_STYLE_FONT_FAMILY_STACKS[DEFAULT_REGION_LABEL_FONT_FAMILY],
    );
    expect(fontFamilyStack('')).toBe(
      MAP_STYLE_FONT_FAMILY_STACKS[DEFAULT_REGION_LABEL_FONT_FAMILY],
    );
    expect(isMapStyleFontFamilyKey('serif')).toBe(true);
    expect(isMapStyleFontFamilyKey('WenKai')).toBe(false);
    expect(isMapStyleFontFamilyKey(42)).toBe(false);
  });
});

/**
 * v0.9.6：区域标签的**位置偏移**（每块区域独立配置）。
 *
 * 两件事：只在区域级出现（地图级 `MapStyle.regionLabel` 没有这一项），以及
 * 两轴都可缺、都有范围。
 */
describe('区域标签位置偏移 (v0.9.6)', () => {
  it('regionStyleOverrideSchema 收 { label: { offset: { x, y } } }', () => {
    const parsed = regionStyleOverrideSchema.parse({
      label: { offset: { x: 12, y: -30 } },
    });
    expect(parsed.label?.offset).toEqual({ x: 12, y: -30 });
  });

  it('两轴都可缺，空对象也合法', () => {
    expect(regionStyleOverrideSchema.safeParse({ label: { offset: {} } }).success).toBe(true);
    expect(regionStyleOverrideSchema.safeParse({ label: { offset: { x: 5 } } }).success).toBe(true);
  });

  it('越界 / 多带键一律拒', () => {
    for (const bad of [
      { x: 5000 },
      { y: -5000 },
      { x: 1, extra: true },
    ] as Array<unknown>) {
      expect(
        regionStyleOverrideSchema.safeParse({ label: { offset: bad } }).success,
        JSON.stringify(bad),
      ).toBe(false);
    }
  });

  it('draftRegionSchema 收带偏移的区域', () => {
    const parsed = draftRegionSchema.parse({
      id: 'rg_a',
      name: '回廊',
      cells: [[0, 0]],
      style: { label: { offset: { x: 6, y: 6 } } },
    });
    expect(parsed.style?.label?.offset).toEqual({ x: 6, y: 6 });
  });

  it('地图级 regionLabel 里没有 offset —— 它只属于某一块区域', () => {
    expect(mapStyleSchema.parse({}).regionLabel).not.toHaveProperty('offset');
  });
});