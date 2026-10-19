import { describe, expect, it } from 'vitest';
import { DEFAULT_MAP_STYLE, MAP_JSON_VERSION } from '@loredoku/shared';
import { isWrappedSnapshot, toGameSnapshot } from '../src/service/gameSnapshotCompat';

/**
 * CONS-K16 (docs/v0.5.0.md §10.1 / §11.3) — stored `map_games.snapshot` rows
 * come in two shapes, and a legacy game must keep playing with **zero repair**.
 * The upgrade is done on read, so these helpers are pure and tested here.
 */

/** v0.4.x: the whole snapshot *is* the map draft, roster and palette included. */
function legacySnapshot(): Record<string, unknown> {
  return {
    version: 2,
    gridSize: 4,
    cells: { '0,0': { item: { assetId: 3, w: 1, h: 1 } } },
    regions: [],
    characterSlots: [
      { characterId: 5, themeColor: '#FFFFFF', clue: '', linkages: [] },
      null,
      null,
      null,
    ],
    style: {
      cellSize: 120,
      linkageColors: [{ key: 'red', label: '红', color: '#EF9A9A' }],
    },
  };
}

/** v0.5.0: `{ map, puzzle }` — the roster and palette live on the puzzle. */
function wrappedSnapshot(): Record<string, unknown> {
  return {
    map: { version: MAP_JSON_VERSION, gridSize: 4, cells: {}, regions: [] },
    puzzle: {
      version: 1,
      map: { mapId: 42, versionNo: 3, gridSize: 4 },
      name: '谜题',
      description: '',
      linkageColors: [{ key: 'red', label: '红', color: '#EF9A9A' }],
      characterSlots: [{ characterId: 7, themeColor: '#FFFFFF', clue: '', linkages: [] }, null, null, null],
    },
  };
}

describe('isWrappedSnapshot (CONS-K16)', () => {
  it('detects the v0.5.0 { map, puzzle } shape', () => {
    expect(isWrappedSnapshot(wrappedSnapshot())).toBe(true);
  });

  it('rejects the v0.4.x draft-shaped snapshot', () => {
    expect(isWrappedSnapshot(legacySnapshot())).toBe(false);
    expect(isWrappedSnapshot(null)).toBe(false);
    expect(isWrappedSnapshot({ map: 'x' })).toBe(false);
  });
});

describe('toGameSnapshot — v0.4.x upgrade (CONS-K16)', () => {
  it('lifts the legacy roster and palette into their own fields', () => {
    const snapshot = toGameSnapshot(legacySnapshot());
    expect(snapshot.puzzle).toBeNull();
    expect(snapshot.legacyCharacterSlots).toHaveLength(4);
    expect(snapshot.legacyCharacterSlots![0]).toMatchObject({ characterId: 5 });
    expect(snapshot.legacyLinkageColors!.map((entry) => entry.key)).toEqual(['red']);
  });

  it('absorbs the map part into the v3 shape', () => {
    const snapshot = toGameSnapshot(legacySnapshot());
    expect(snapshot.map.version).toBe(MAP_JSON_VERSION);
    expect('characterSlots' in snapshot.map).toBe(false);
    expect(snapshot.map.style).toBeDefined();
    expect(
      'linkageColors' in (snapshot.map.style as unknown as Record<string, unknown>),
    ).toBe(false);
    // The map's own fields survive the upgrade.
    expect(snapshot.map.cells['0,0']!.item!.assetId).toBe(3);
  });

  it('omits the legacy fields when the old snapshot had neither', () => {
    const snapshot = toGameSnapshot({ version: 2, gridSize: 4, cells: {}, regions: [] });
    expect(snapshot.puzzle).toBeNull();
    expect(snapshot.legacyCharacterSlots).toBeUndefined();
    expect(snapshot.legacyLinkageColors).toBeUndefined();
    // A missing style block resolves to the shipped defaults.
    expect(snapshot.map.style).toEqual(DEFAULT_MAP_STYLE);
  });
});

describe('toGameSnapshot — v0.5.0 shape (CONS-K16)', () => {
  it('passes the puzzle half through untouched', () => {
    const snapshot = toGameSnapshot(wrappedSnapshot());
    expect(snapshot.puzzle?.name).toBe('谜题');
    expect(snapshot.puzzle?.characterSlots[0]).toMatchObject({ characterId: 7 });
    expect(snapshot.map.gridSize).toBe(4);
    expect(snapshot.legacyCharacterSlots).toBeUndefined();
  });

  it('re-reads legacy fields that were carried alongside a wrapped snapshot', () => {
    const snapshot = toGameSnapshot({
      ...wrappedSnapshot(),
      puzzle: null,
      legacyCharacterSlots: [{ characterId: 11, themeColor: '#FFFFFF', clue: '', linkages: [] }],
      legacyLinkageColors: [{ key: 'blue', label: '蓝', color: '#90CAF9' }],
    });
    expect(snapshot.puzzle).toBeNull();
    expect(snapshot.legacyCharacterSlots).toHaveLength(1);
    expect(snapshot.legacyCharacterSlots![0]).toMatchObject({ characterId: 11 });
    expect(snapshot.legacyLinkageColors!.map((entry) => entry.key)).toEqual(['blue']);
  });
});
