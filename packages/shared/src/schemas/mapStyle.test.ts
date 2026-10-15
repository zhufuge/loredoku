import { describe, expect, it } from 'vitest';
import { MAP_JSON_VERSION } from '../constants';
import { mapDraftSchema, mapStyleSchema } from './mapDraft';

function draft(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    gridSize: 4,
    cells: {},
    regions: [],
    characterSlots: Array.from({ length: 4 }, () => null),
    ...extra,
  };
}

const slot = (color: string) => ({
  characterId: 1,
  themeColor: '#FFFFFF',
  clue: '',
  linkages: [{ type: 'cell', cells: [[0, 0]], effect: 'highlight', color }],
});

describe('mapStyleSchema (v0.3.8 FEAT-D02)', () => {
  it('fills a partial style from the shipped defaults', () => {
    const result = mapStyleSchema.safeParse({ regionHighlight: { width: 6 } });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.regionHighlight.width).toBe(6);
    expect(result.data.regionHighlight.color).toBe('#90CAF9');
    expect(result.data.gridSeparator).toEqual({ width: 2, color: '#000000' });
    expect(result.data.cellSize).toBeNull();
    expect(result.data.linkageColors.map((entry) => entry.key)).toEqual(['red', 'blue']);
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

  it('enforces the 2 ~ 12 palette size (FEAT-D04)', () => {
    expect(
      mapStyleSchema.safeParse({ linkageColors: [{ key: 'red', label: '红', color: '#EF9A9A' }] })
        .success,
    ).toBe(false);
    const twelve = Array.from({ length: 12 }, (_, index) => ({
      key: `k${index}`,
      label: `k${index}`,
      color: '#123456',
    }));
    expect(mapStyleSchema.safeParse({ linkageColors: twelve }).success).toBe(true);
    expect(
      mapStyleSchema.safeParse({ linkageColors: [...twelve, { key: 'k13', label: 'x', color: '#123456' }] })
        .success,
    ).toBe(false);
  });

  it('validates palette keys, labels and colours', () => {
    const withColor = (entry: Record<string, unknown>) => ({
      linkageColors: [
        { key: 'red', label: '红', color: '#EF9A9A' },
        entry,
      ],
    });
    expect(mapStyleSchema.safeParse(withColor({ key: 'Bad', label: 'x', color: '#123456' })).success).toBe(
      false,
    );
    expect(mapStyleSchema.safeParse(withColor({ key: 'x', label: '', color: '#123456' })).success).toBe(
      false,
    );
    expect(mapStyleSchema.safeParse(withColor({ key: 'x', label: 'x', color: 'blue' })).success).toBe(
      false,
    );
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

  it('accepts a linkage colour that exists in the custom palette', () => {
    const result = mapDraftSchema.safeParse(
      draft({
        characterSlots: [
          slot('teal'),
          null,
          null,
          null,
        ],
        style: {
          linkageColors: [
            { key: 'red', label: '红', color: '#EF9A9A' },
            { key: 'teal', label: '青', color: '#0B7E74' },
          ],
        },
      }),
    );
    expect(result.success).toBe(true);
  });

  it('rejects a linkage colour missing from the palette (FEAT-D04 §保存时校验)', () => {
    const result = mapDraftSchema.safeParse(draft({ characterSlots: [slot('green'), null, null, null] }));
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((issue) => issue.message.includes('green'))).toBe(true);
  });

  it('accepts the built-in red / blue keys without any style block', () => {
    expect(mapDraftSchema.safeParse(draft({ characterSlots: [slot('red'), null, null, null] })).success).toBe(
      true,
    );
    expect(
      mapDraftSchema.safeParse(draft({ characterSlots: [slot('blue'), null, null, null] })).success,
    ).toBe(true);
  });

  it('rejects unknown top-level keys (schema stays strict)', () => {
    expect(mapDraftSchema.safeParse(draft({ theme: {} })).success).toBe(false);
  });
});
