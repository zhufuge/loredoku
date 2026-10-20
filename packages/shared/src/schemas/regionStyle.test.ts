import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAP_STYLE,
  MAP_STYLE_REGION_LABEL_STROKE_MAX,
  REGION_BORDER_WIDTH_MAX,
  REGION_BORDER_WIDTH_MIN,
  STYLE_DEFAULT_REGION_LABEL_HOVER_STROKE_WIDTH,
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
    expect(regionStyleOverrideSchema.safeParse({ outline: { width: 2 } }).success).toBe(false);
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
