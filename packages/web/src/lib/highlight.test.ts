import { describe, expect, it } from 'vitest';
import type {
  CharacterSlotEntry,
  DraftCell,
  DraftRegion,
  ParticipantTarget,
} from '@murdoku/shared';
import {
  collectLinkages,
  findAllItemAnchors,
  findItemPlacements,
  resolveHighlight,
  type CellMap,
} from './highlight';

function cells(entries: Array<[string, DraftCell]>): CellMap {
  return new Map(entries);
}

const regions: DraftRegion[] = [
  {
    id: 'rg_forest',
    name: '森林区',
    color: '#000000',
    borderWidth: 6,
    fillOpacity: 0,
    cells: [
      [2, 2],
      [3, 2],
    ],
  },
];

const ctxCells = cells([
  ['0,0', { object: { itemId: 12, w: 2, h: 1 } }],
  ['1,0', {}],
]);

const ctx = {
  gridSize: 6,
  cells: ctxCells,
  characterSlots: [] as Array<CharacterSlotEntry | null>,
  regions,
};

// CLAR-603: participants live in the roster. Slot index 1 holds character 7.
const slots: Array<CharacterSlotEntry | null> = [
  { characterId: 5, themeColor: '#FFCC00', clue: '', linkages: [] },
  { characterId: 7, themeColor: '#FFFFFF', clue: '', linkages: [] },
  null,
];

// MOD-801: one flat list (no click/touch grouping).
const linkages: ParticipantTarget[] = [
  { type: 'character', id: 7, effect: 'highlight', color: 'red' },
  { type: 'item', id: 12, scope: 'all', effect: 'highlight', color: 'blue' },
  { type: 'cell', cells: [[4, 4]], effect: 'highlight', color: 'red' },
  { type: 'region', id: 'rg_forest', effect: 'highlight', color: 'blue' },
];

describe('findItemPlacements', () => {
  it('reports the layer of every placement of an item id', () => {
    const mixed = cells([
      ['0,0', { object: { itemId: 12, w: 2, h: 1 } }],
      ['3,3', { background: { itemId: 12 } }],
      ['4,4', { background: { itemId: 99 } }],
    ]);
    expect(findItemPlacements(mixed, 12)).toEqual([
      { layer: 'object', x: 0, y: 0, w: 2, h: 1, anchorX: 0, anchorY: 0 },
      { layer: 'background', x: 3, y: 3, w: 1, h: 1, anchorX: 3, anchorY: 3 },
    ]);
    expect(findItemPlacements(mixed, 42)).toEqual([]);
  });
});

describe('findAllItemAnchors', () => {
  it('locates all anchor cells of a placed object (object layer only)', () => {
    const mixed = cells([
      ['0,0', { object: { itemId: 12, w: 2, h: 1 } }],
      ['3,3', { background: { itemId: 12 } }],
    ]);
    expect(findAllItemAnchors(mixed, 12)).toEqual([{ x: 0, y: 0, w: 2, h: 1, color: '' }]);
    expect(findAllItemAnchors(ctxCells, 99)).toEqual([]);
  });
});

describe('collectLinkages', () => {
  it('de-duplicates identical targets (later wins) across the flat list', () => {
    const collected = collectLinkages([
      { type: 'cell', cells: [[1, 1]], effect: 'highlight', color: 'red' },
      { type: 'cell', cells: [[1, 1]], effect: 'highlight', color: 'blue' },
    ]);
    expect(collected).toHaveLength(1);
    expect(collected[0]!.target.color).toBe('blue');
  });

  it('keeps different colours of the same object as separate entries', () => {
    const collected = collectLinkages([
      { type: 'cell', cells: [[1, 1]], effect: 'highlight', color: 'red' },
      { type: 'cell', cells: [[1, 1]], effect: 'highlight', color: 'red' },
      { type: 'cell', cells: [[2, 2]], effect: 'highlight', color: 'red' },
    ]);
    expect(collected).toHaveLength(2);
  });

  it('returns an empty list for undefined input', () => {
    expect(collectLinkages(undefined)).toEqual([]);
  });
});

describe('resolveHighlight', () => {
  it('resolves slot characters, items, cells and regions from one flat list', () => {
    const state = resolveHighlight(linkages, { ...ctx, characterSlots: slots });
    expect(state).not.toBeNull();
    // Character 7 lives at slot index 1.
    expect(state!.characters).toEqual([{ slotIndex: 1, color: '#EF4444' }]);
    // OPT-903 §7.3: a 2×1 object lights up BOTH occupied cells as 方块高亮.
    expect(state!.cellHighlights).toEqual([
      { x: 0, y: 0, w: 1, h: 1, color: '#3B82F6' },
      { x: 1, y: 0, w: 1, h: 1, color: '#3B82F6' },
      { x: 4, y: 4, w: 1, h: 1, color: '#EF4444' },
    ]);
    expect(state!.backgroundHighlights).toEqual([]);
    // MOD-802: regions always render as the inner blue border.
    expect(state!.regionBorders).toEqual([
      { regionId: 'rg_forest', color: '#3B82F6' },
    ]);
  });

  it('MOD-802: region targets always produce a border, never a cell fill', () => {
    for (const color of ['red', 'blue'] as const) {
      const state = resolveHighlight(
        [{ type: 'region', id: 'rg_forest', effect: 'highlight', color }],
        { ...ctx, characterSlots: slots },
      );
      expect(state!.cellHighlights).toHaveLength(0);
      expect(state!.backgroundHighlights).toHaveLength(0);
      expect(state!.regionBorders).toEqual([
        { regionId: 'rg_forest', color: '#3B82F6' },
      ]);
    }
  });

  it('MOD-708: cell targets with multiple coords produce multiple blocks', () => {
    const state = resolveHighlight(
      [{ type: 'cell', cells: [[1, 1], [2, 2], [3, 3]], effect: 'highlight', color: 'red' }],
      { ...ctx, characterSlots: slots },
    );
    expect(state!.cellHighlights).toHaveLength(3);
  });

  it('skips dangling references instead of throwing', () => {
    const state = resolveHighlight(
      [
        { type: 'character', id: 404, effect: 'highlight', color: 'red' },
        { type: 'cell', cells: [[4, 4]], effect: 'highlight', color: 'red' },
      ],
      { ...ctx, characterSlots: slots },
    );
    expect(state!.characters).toHaveLength(0);
    expect(state!.cellHighlights).toHaveLength(1);
  });

  it('skips out-of-bounds cell coords', () => {
    const state = resolveHighlight(
      [{ type: 'cell', cells: [[4, 4], [99, 0]], effect: 'highlight', color: 'red' }],
      { ...ctx, characterSlots: slots },
    );
    expect(state!.cellHighlights).toHaveLength(1);
  });

  it('returns null when nothing resolves or the list is empty', () => {
    expect(
      resolveHighlight(
        [
          { type: 'character', id: 7, effect: 'highlight', color: 'red' },
          { type: 'item', id: 12, scope: 'all', effect: 'highlight', color: 'blue' },
        ],
        { gridSize: 6, cells: cells([]), characterSlots: [], regions: [] },
      ),
    ).toBeNull();
    expect(resolveHighlight(undefined, { ...ctx, characterSlots: slots })).toBeNull();
    expect(
      resolveHighlight([], { ...ctx, characterSlots: slots }),
    ).toBeNull();
  });

  it('MOD-708: item scope instances highlights only specified coords', () => {
    const multiCells = cells([
      ['0,0', { object: { itemId: 12, w: 1, h: 1 } }],
      ['2,2', { object: { itemId: 12, w: 1, h: 1 } }],
    ]);
    const state = resolveHighlight(
      [
        {
          type: 'item',
          id: 12,
          scope: 'instances',
          instances: [[2, 2]],
          effect: 'highlight',
          color: 'red',
        },
      ],
      { gridSize: 6, cells: multiCells, characterSlots: slots, regions },
    );
    expect(state!.cellHighlights).toHaveLength(1);
    expect(state!.cellHighlights[0]).toMatchObject({ x: 2, y: 2 });
  });

  it('MOD-708: item scope all highlights every instance', () => {
    const multiCells = cells([
      ['0,0', { object: { itemId: 12, w: 1, h: 1 } }],
      ['2,2', { object: { itemId: 12, w: 1, h: 1 } }],
    ]);
    const state = resolveHighlight(
      [{ type: 'item', id: 12, scope: 'all', effect: 'highlight', color: 'blue' }],
      { gridSize: 6, cells: multiCells, characterSlots: slots, regions },
    );
    expect(state!.cellHighlights).toHaveLength(2);
  });

  // ---- OPT-903 §3 / §7.3: 方块高亮 replaces the v0.3.3 translucent overlay ----
  it('OPT-903 §7.3: an object linkage produces 方块高亮, never a translucent overlay', () => {
    const state = resolveHighlight(
      [{ type: 'item', id: 12, scope: 'all', effect: 'highlight', color: 'red' }],
      { ...ctx, characterSlots: slots },
    );
    // One opaque rect per occupied cell of the 2×1 footprint.
    expect(state!.cellHighlights).toEqual([
      { x: 0, y: 0, w: 1, h: 1, color: '#EF4444' },
      { x: 1, y: 0, w: 1, h: 1, color: '#EF4444' },
    ]);
    expect(state).not.toHaveProperty('objects');
    expect(state!.backgroundHighlights).toEqual([]);
  });

  it('OPT-903 §1.2.8: a background linkage produces 背景高亮 only', () => {
    const mixed = cells([
      ['0,0', { background: { itemId: 21 } }],
      ['2,2', { background: { itemId: 21 } }],
      ['3,3', { object: { itemId: 21, w: 1, h: 1 } }],
    ]);
    const state = resolveHighlight(
      [{ type: 'item', id: 21, scope: 'all', effect: 'highlight', color: 'blue' }],
      { gridSize: 6, cells: mixed, characterSlots: slots, regions },
    );
    // Background placements → 背景高亮; the object placement → 方块高亮.
    expect(state!.backgroundHighlights).toEqual([
      { x: 0, y: 0, w: 1, h: 1, color: '#3B82F6' },
      { x: 2, y: 2, w: 1, h: 1, color: '#3B82F6' },
    ]);
    expect(state!.cellHighlights).toEqual([
      { x: 3, y: 3, w: 1, h: 1, color: '#3B82F6' },
    ]);
  });

  it('OPT-903: 方块高亮 spans every cell of a 2×2 object', () => {
    const big = cells([['1,1', { object: { itemId: 30, w: 2, h: 2 } }]]);
    const state = resolveHighlight(
      [{ type: 'item', id: 30, scope: 'all', effect: 'highlight', color: 'red' }],
      { gridSize: 6, cells: big, characterSlots: slots, regions },
    );
    expect(state!.cellHighlights.map((rect) => `${rect.x},${rect.y}`).sort()).toEqual([
      '1,1',
      '1,2',
      '2,1',
      '2,2',
    ]);
  });
});
