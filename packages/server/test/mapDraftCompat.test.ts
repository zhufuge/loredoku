import { describe, expect, it } from 'vitest';
import { MAP_JSON_VERSION } from '@loredoku/shared';
import {
  absorbLegacyMapDraft,
  readLegacyCharacterSlots,
  readLegacyLinkageColors,
} from '../src/service/mapDraftCompat';

/**
 * FEAT-K14 (docs/v0.5.0.md §8.3) — the absorption layer. Stored map drafts may
 * still be the v2 shape (roster + palette inside them); the v3 schemas are
 * `.strict()`, so every read path runs the raw JSON through these helpers
 * instead of rewriting the database.
 */

/** A v0.4.x-style payload: the roster and the palette live inside the map. */
function v2Draft(): Record<string, unknown> {
  return {
    version: 2,
    gridSize: 4,
    cells: { '0,0': { object: { itemId: 3, w: 1, h: 1 } } },
    regions: [{ id: 'rg_a', name: 'A', color: '#000000', borderWidth: 4, fillOpacity: 1, cells: [[0, 0]] }],
    characterSlots: [
      { characterId: 5, themeColor: '#FFFFFF', clue: '', linkages: [] },
      null,
      null,
      null,
    ],
    style: {
      cellSize: 120,
      linkageColors: [
        { key: 'red', label: '红', color: '#EF9A9A' },
        { key: 'teal', label: '青', color: '#0B7E74' },
      ],
    },
  };
}

describe('readLegacyCharacterSlots (FEAT-K14)', () => {
  it('extracts the v2 roster, keeping slots verbatim', () => {
    const slots = readLegacyCharacterSlots(v2Draft());
    expect(slots).toHaveLength(4);
    expect(slots[0]).toEqual({ characterId: 5, themeColor: '#FFFFFF', clue: '', linkages: [] });
    expect(slots[1]).toBeNull();
  });

  it('returns an empty array for a v3 payload', () => {
    expect(readLegacyCharacterSlots({ version: 3, gridSize: 4, cells: {}, regions: [] })).toEqual([]);
  });

  it('degrades to an empty array for malformed input', () => {
    expect(readLegacyCharacterSlots(null)).toEqual([]);
    expect(readLegacyCharacterSlots('nope')).toEqual([]);
    expect(readLegacyCharacterSlots([1, 2])).toEqual([]);
    expect(readLegacyCharacterSlots({ characterSlots: 'x' })).toEqual([]);
  });

  it('coerces non-object slots to null instead of throwing', () => {
    const slots = readLegacyCharacterSlots({ characterSlots: [{ characterId: 1 }, 'junk', 7] });
    expect(slots).toHaveLength(3);
    expect(slots[0]).toEqual({ characterId: 1 });
    expect(slots[1]).toBeNull();
    expect(slots[2]).toBeNull();
  });
});

describe('readLegacyLinkageColors (FEAT-K14)', () => {
  it('extracts the v2 palette from style.linkageColors', () => {
    expect(readLegacyLinkageColors(v2Draft()).map((entry) => entry.key)).toEqual(['red', 'teal']);
  });

  it('returns an empty array when there is no palette', () => {
    expect(readLegacyLinkageColors({ version: 3, style: { cellSize: 100 } })).toEqual([]);
    expect(readLegacyLinkageColors(null)).toEqual([]);
    expect(readLegacyLinkageColors({ style: { linkageColors: 'x' } })).toEqual([]);
  });

  it('drops malformed entries rather than the whole palette', () => {
    const colors = readLegacyLinkageColors({
      style: { linkageColors: [{ key: 'red', label: '红', color: '#EF9A9A' }, { key: 'blue' }] },
    });
    expect(colors.map((entry) => entry.key)).toEqual(['red']);
  });
});

describe('absorbLegacyMapDraft (FEAT-K14)', () => {
  it('strips the roster and the palette and stamps the current version', () => {
    const absorbed = absorbLegacyMapDraft(v2Draft()) as Record<string, unknown>;
    expect(absorbed['version']).toBe(MAP_JSON_VERSION);
    expect('characterSlots' in absorbed).toBe(false);
    const style = absorbed['style'] as Record<string, unknown>;
    expect(style['cellSize']).toBe(120);
    expect('linkageColors' in style).toBe(false);
    // Everything else is passed through untouched.
    expect(absorbed['gridSize']).toBe(4);
    expect(absorbed['cells']).toEqual({ '0,0': { object: { itemId: 3, w: 1, h: 1 } } });
    expect((absorbed['regions'] as unknown[])[0]).toMatchObject({ id: 'rg_a' });
  });

  it('is idempotent — a v3 payload comes back as the very same reference', () => {
    const v3 = { version: MAP_JSON_VERSION, gridSize: 4, cells: {}, regions: [] };
    expect(absorbLegacyMapDraft(v3)).toBe(v3);
    // …and running it twice on a v2 payload is stable.
    const once = absorbLegacyMapDraft(v2Draft());
    expect(absorbLegacyMapDraft(once)).toBe(once);
  });

  it('stamps the version even when there is nothing to strip', () => {
    const absorbed = absorbLegacyMapDraft({ version: 1, gridSize: 4, cells: {}, regions: [] }) as Record<
      string,
      unknown
    >;
    expect(absorbed['version']).toBe(MAP_JSON_VERSION);
  });

  it('returns non-object input unchanged', () => {
    expect(absorbLegacyMapDraft(null)).toBeNull();
    expect(absorbLegacyMapDraft(undefined)).toBeUndefined();
    expect(absorbLegacyMapDraft('x')).toBe('x');
    expect(absorbLegacyMapDraft([1])).toEqual([1]);
  });
});
