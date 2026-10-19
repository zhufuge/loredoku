import { describe, expect, it } from 'vitest';
import {
  MAP_JSON_VERSION,
  STYLE_DEFAULT_GRID_SEPARATOR_WIDTH,
  STYLE_DEFAULT_REGION_HIGHLIGHT_COLOR,
} from '../constants';
import { mapDraftSchema, mapStyleSchema } from './mapDraft';

function draft(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    gridSize: 4,
    cells: {},
    regions: [],
    ...extra,
  };
}

describe('mapStyleSchema (v0.3.8 FEAT-D02)', () => {
  it('fills a partial style from the shipped defaults', () => {
    const result = mapStyleSchema.safeParse({ regionHighlight: { width: 6 } });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.regionHighlight.width).toBe(6);
    // v0.5.2 SPEC-M07: the highlight line is the strong blue, and the grid
    // separator is 4px (was the pale blue / 2px).
    expect(result.data.regionHighlight.color).toBe(STYLE_DEFAULT_REGION_HIGHLIGHT_COLOR);
    expect(result.data.gridSeparator).toEqual({
      width: STYLE_DEFAULT_GRID_SEPARATOR_WIDTH,
      color: '#000000',
    });
    expect(result.data.cellSize).toBeNull();
  });

  it('rejects out-of-range numbers instead of silently clamping', () => {
    expect(mapStyleSchema.safeParse({ gridSeparator: { width: 99 } }).success).toBe(false);
    expect(mapStyleSchema.safeParse({ gridSeparator: { width: 0 } }).success).toBe(false);
    expect(mapStyleSchema.safeParse({ cellSize: 40 }).success).toBe(false);
    expect(mapStyleSchema.safeParse({ cellSize: 400 }).success).toBe(false);
    expect(mapStyleSchema.safeParse({ regionOutline: { width: 99 } }).success).toBe(false);
    expect(mapStyleSchema.safeParse({ regionLabel: { fontSize: 400 } }).success).toBe(false);
    expect(mapStyleSchema.safeParse({ operationCursorBox: { offset: 99 } }).success).toBe(false);
  });

  it('accepts every documented boundary value', () => {
    expect(mapStyleSchema.safeParse({ cellSize: 90 }).success).toBe(true);
    expect(mapStyleSchema.safeParse({ cellSize: 240 }).success).toBe(true);
    expect(mapStyleSchema.safeParse({ regionOutline: { width: 4 } }).success).toBe(true);
    expect(mapStyleSchema.safeParse({ regionOutline: { width: 12 } }).success).toBe(true);
  });

  it('requires #RRGGBB colours', () => {
    expect(mapStyleSchema.safeParse({ gridSeparator: { color: 'red' } }).success).toBe(false);
    expect(mapStyleSchema.safeParse({ gridSeparator: { color: '#fff' } }).success).toBe(false);
    expect(mapStyleSchema.safeParse({ gridSeparator: { color: '#A1B2C3' } }).success).toBe(true);
  });

  it('keeps the cursor shadow ring on rgb/rgba too', () => {
    expect(mapStyleSchema.safeParse({ mouseCursorBox: { shadowColor: 'rgba(0,0,0,0.15)' } }).success).toBe(
      true,
    );
    expect(mapStyleSchema.safeParse({ mouseCursorBox: { shadowColor: 'nope' } }).success).toBe(false);
  });

  it('no longer carries the linkage palette (v0.5.0 FEAT-K14)', () => {
    const parsed = mapStyleSchema.parse({});
    expect('linkageColors' in parsed).toBe(false);
    // The palette block itself is rejected, not silently dropped (strict).
    expect(
      mapStyleSchema.safeParse({ linkageColors: [{ key: 'red', label: '红', color: '#EF9A9A' }] })
        .success,
    ).toBe(false);
  });
});

describe('mapDraftSchema + style (v0.3.8)', () => {
  it('still accepts a version-1 draft without any style block', () => {
    const result = mapDraftSchema.safeParse(draft());
    expect(result.success).toBe(true);
  });

  it('accepts a full style block', () => {
    const result = mapDraftSchema.safeParse(
      draft({ version: MAP_JSON_VERSION, style: { cellSize: 150 } }),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.style?.cellSize).toBe(150);
  });

  it('rejects unknown top-level keys (schema stays strict)', () => {
    expect(mapDraftSchema.safeParse(draft({ theme: {} })).success).toBe(false);
  });
});

describe('mapDraftSchema 的 v3 形状 (v0.5.0 FEAT-K14)', () => {
  it('rejects a v2 payload that still carries the roster', () => {
    const result = mapDraftSchema.safeParse(
      draft({ version: 2, characterSlots: [{ characterId: 1 }, null] }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects a v2 payload that still carries style.linkageColors', () => {
    const result = mapDraftSchema.safeParse(
      draft({
        version: 2,
        style: { linkageColors: [{ key: 'red', label: '红', color: '#EF9A9A' }] },
      }),
    );
    expect(result.success).toBe(false);
  });

  it('accepts the v3 shape: canvas + style, no roster', () => {
    const result = mapDraftSchema.safeParse(
      draft({
        version: MAP_JSON_VERSION,
        cells: { '0,0': { item: { assetId: 7, w: 1, h: 1 } } },
        regions: [{ id: 'rg_1', name: '门厅', cells: [[0, 0]] }],
        style: { cellSize: null },
      }),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.version).toBe(MAP_JSON_VERSION);
    expect('characterSlots' in result.data).toBe(false);
  });
});
