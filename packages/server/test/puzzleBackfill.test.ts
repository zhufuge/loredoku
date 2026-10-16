import { describe, expect, it } from 'vitest';
import { DEFAULT_LINKAGE_COLORS, PUZZLE_JSON_VERSION } from '@loredoku/shared';
import {
  buildPuzzleSeedFromMap,
  linkageColorsFromLegacyDraft,
  slotsFromLegacyDraft,
} from '../src/service/puzzleBackfill';

/**
 * v0.5.0 §11.2 (docs/v0.5.0.md) — the pure half of the puzzle backfill
 * migration. The knex migration reads `map_projects` / `map_versions` and
 * delegates every shape decision to these functions, which is why they are
 * unit tested here rather than against a database.
 */

/** A v0.4.x version snapshot: the roster and the palette live inside it. */
function v2VersionData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 2,
    gridSize: 4,
    cells: { '1,1': { object: { itemId: 9, w: 1, h: 1 } } },
    regions: [],
    characterSlots: [
      { characterId: 5, themeColor: '#FFFFFF', clue: '', linkages: [] },
      { characterId: 6, themeColor: '#000000', clue: '', linkages: [] },
    ],
    style: {
      linkageColors: [
        { key: 'red', label: '红', color: '#EF9A9A' },
        { key: 'teal', label: '青', color: '#0B7E74' },
      ],
    },
    ...overrides,
  };
}

describe('slotsFromLegacyDraft (FEAT-K01 §11.2)', () => {
  it('pads a short roster to the grid size with nulls', () => {
    const slots = slotsFromLegacyDraft(v2VersionData(), 4);
    expect(slots).toHaveLength(4);
    expect(slots[0]).toMatchObject({ characterId: 5 });
    expect(slots[1]).toMatchObject({ characterId: 6 });
    expect(slots[2]).toBeNull();
    expect(slots[3]).toBeNull();
  });

  it('truncates a roster longer than the grid size', () => {
    const raw = v2VersionData({
      characterSlots: Array.from({ length: 8 }, () => ({ characterId: 1 })),
    });
    expect(slotsFromLegacyDraft(raw, 3)).toHaveLength(3);
  });

  it('produces an all-null roster when the snapshot carried none', () => {
    const slots = slotsFromLegacyDraft({ version: 2, gridSize: 3, cells: {}, regions: [] }, 3);
    expect(slots).toEqual([null, null, null]);
  });
});

describe('linkageColorsFromLegacyDraft (FEAT-K01 §11.2)', () => {
  it('prefers the version palette when it had one', () => {
    expect(linkageColorsFromLegacyDraft(v2VersionData()).map((entry) => entry.key)).toEqual([
      'red',
      'teal',
    ]);
  });

  it('falls back to the shipped default pair, never by reference', () => {
    const colors = linkageColorsFromLegacyDraft({ version: 3, gridSize: 4 });
    expect(colors.map((entry) => entry.key)).toEqual(DEFAULT_LINKAGE_COLORS.map((entry) => entry.key));
    expect(colors[0]).not.toBe(DEFAULT_LINKAGE_COLORS[0]);
  });
});

describe('buildPuzzleSeedFromMap (FEAT-K01 §11.2)', () => {
  const project = { id: 42, name: '大宅', description: '一栋宅子', gridSize: 4 };

  it('builds a puzzle draft for a map that has a published version', () => {
    const seed = buildPuzzleSeedFromMap(
      project,
      { versionNo: 3, gridSize: 4, data: v2VersionData() },
      '大宅',
    );
    expect(seed).not.toBeNull();
    expect(seed!.version).toBe(PUZZLE_JSON_VERSION);
    expect(seed!.map).toEqual({ projectId: 42, versionNo: 3, gridSize: 4 });
    expect(seed!.name).toBe('大宅');
    expect(seed!.description).toBe('一栋宅子');
    expect(seed!.characterSlots).toHaveLength(4);
    expect(seed!.characterSlots[0]).toMatchObject({ characterId: 5 });
    expect(seed!.linkageColors.map((entry) => entry.key)).toEqual(['red', 'teal']);
  });

  it('falls back to an empty description when the map had none', () => {
    const seed = buildPuzzleSeedFromMap(
      { ...project, description: null },
      { versionNo: 1, gridSize: 4, data: v2VersionData() },
      '大宅',
    );
    expect(seed!.description).toBe('');
  });

  it('returns null when the map was never published', () => {
    // A puzzle cannot exist without a canvas to draw on, so the roster stays
    // in the old JSON untouched.
    expect(buildPuzzleSeedFromMap(project, null, '大宅')).toBeNull();
  });
});
