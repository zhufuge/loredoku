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

describe('findAllItemAnchors', () => {
  it('locates all anchor cells of a placed item', () => {
    expect(findAllItemAnchors(ctxCells, 12)).toEqual([
      { x: 0, y: 0, w: 2, h: 1, color: '' },
    ]);
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
    const state = resolveHighlight(linkages, {
      gridSize: 6,
      cells: ctxCells,
      characterSlots: slots,
      regions,
    });
    expect(state).not.toBeNull();
    // Character 7 lives at slot index 1.
    expect(state!.characters).toEqual([{ slotIndex: 1, color: '#EF4444' }]);
    expect(state!.objects).toEqual([{ x: 0, y: 0, w: 2, h: 1, color: '#3B82F6' }]);
    expect(state!.cells).toEqual([{ x: 4, y: 4, w: 1, h: 1, color: '#EF4444' }]);
    // MOD-802: regions always render as the inner blue border.
    expect(state!.regionBorders).toEqual([
      { regionId: 'rg_forest', color: '#3B82F6' },
    ]);
  });

  it('MOD-802: region targets always produce a border, never a cell fill', () => {
    for (const color of ['red', 'blue'] as const) {
      const state = resolveHighlight(
        [{ type: 'region', id: 'rg_forest', effect: 'highlight', color }],
        { gridSize: 6, cells: ctxCells, characterSlots: slots, regions },
      );
      expect(state!.cells).toHaveLength(0);
      expect(state!.regionBorders).toEqual([
        { regionId: 'rg_forest', color: '#3B82F6' },
      ]);
    }
  });

  it('MOD-708: cell targets with multiple coords produce multiple rects', () => {
    const state = resolveHighlight(
      [{ type: 'cell', cells: [[1, 1], [2, 2], [3, 3]], effect: 'highlight', color: 'red' }],
      { gridSize: 6, cells: ctxCells, characterSlots: slots, regions },
    );
    expect(state!.cells).toHaveLength(3);
  });

  it('skips dangling references instead of throwing', () => {
    const state = resolveHighlight(
      [
        { type: 'character', id: 404, effect: 'highlight', color: 'red' },
        { type: 'cell', cells: [[4, 4]], effect: 'highlight', color: 'red' },
      ],
      { gridSize: 6, cells: ctxCells, characterSlots: slots, regions },
    );
    expect(state!.characters).toHaveLength(0);
    expect(state!.cells).toHaveLength(1);
  });

  it('skips out-of-bounds cell coords', () => {
    const state = resolveHighlight(
      [{ type: 'cell', cells: [[4, 4], [99, 0]], effect: 'highlight', color: 'red' }],
      { gridSize: 6, cells: ctxCells, characterSlots: slots, regions },
    );
    expect(state!.cells).toHaveLength(1);
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
    expect(
      resolveHighlight(undefined, {
        gridSize: 6,
        cells: ctxCells,
        characterSlots: slots,
        regions,
      }),
    ).toBeNull();
    expect(resolveHighlight([], {
      gridSize: 6,
      cells: ctxCells,
      characterSlots: slots,
      regions,
    })).toBeNull();
  });

  it('MOD-708: item scope instances highlights only specified coords', () => {
    // Place two instances of item 12
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
    expect(state!.objects).toHaveLength(1);
    expect(state!.objects[0]).toMatchObject({ x: 2, y: 2 });
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
    expect(state!.objects).toHaveLength(2);
  });
});
