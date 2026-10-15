import { describe, expect, it } from 'vitest';
import type {
  CharacterSlotEntry,
  DraftCell,
  DraftRegion,
  ParticipantTrigger,
} from '@murdoku/shared';
import {
  collectTriggerTargets,
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
  { characterId: 5, themeColor: '#FFCC00', clue: '', triggers: [] },
  { characterId: 7, themeColor: '#FFFFFF', clue: '', triggers: [] },
  null,
];

const triggers: ParticipantTrigger[] = [
  {
    trigger: 'click',
    targets: [
      { type: 'character', id: 7, effect: 'highlight', color: 'red' },
      { type: 'item', id: 12, scope: 'all', effect: 'highlight', color: 'blue' },
      { type: 'cell', cells: [[4, 4]], effect: 'highlight', color: 'red' },
    ],
  },
  {
    trigger: 'touch',
    targets: [{ type: 'region', id: 'rg_forest', effect: 'highlight', color: 'blue' }],
  },
];

describe('findAllItemAnchors', () => {
  it('locates all anchor cells of a placed item', () => {
    expect(findAllItemAnchors(ctxCells, 12)).toEqual([
      { x: 0, y: 0, w: 2, h: 1, color: '' },
    ]);
    expect(findAllItemAnchors(ctxCells, 99)).toEqual([]);
  });
});

describe('collectTriggerTargets', () => {
  it('keeps only the requested group and de-duplicates identical targets', () => {
    const groups: ParticipantTrigger[] = [
      {
        trigger: 'click',
        targets: [
          { type: 'cell', cells: [[1, 1]], effect: 'highlight', color: 'red' },
          { type: 'cell', cells: [[1, 1]], effect: 'highlight', color: 'blue' },
        ],
      },
    ];
    const collected = collectTriggerTargets(groups, 'click');
    expect(collected).toHaveLength(1);
    expect(collected[0]!.target.color).toBe('blue');
    expect(collectTriggerTargets(groups, 'touch')).toHaveLength(0);
  });
});

describe('resolveHighlight', () => {
  it('resolves slot characters, items and cells for the click group', () => {
    const state = resolveHighlight(triggers, 'click', {
      gridSize: 6,
      cells: ctxCells,
      characterSlots: slots,
      regions,
    });
    expect(state).not.toBeNull();
    // Character 7 lives at slot index 1.
    expect(state!.characters).toEqual([
      { slotIndex: 1, color: '#EF4444', trigger: 'click' },
    ]);
    expect(state!.objects).toEqual([{ x: 0, y: 0, w: 2, h: 1, color: '#3B82F6' }]);
    expect(state!.cells).toEqual([{ x: 4, y: 4, w: 1, h: 1, color: '#EF4444' }]);
  });

  it('MOD-709: touch region → border outline, not cell fill', () => {
    const state = resolveHighlight(triggers, 'touch', {
      gridSize: 6,
      cells: ctxCells,
      characterSlots: slots,
      regions,
    });
    expect(state!.cells).toEqual([]);
    expect(state!.regionBorders).toEqual([
      { regionId: 'rg_forest', color: '#3B82F6' },
    ]);
  });

  it('MOD-708: cell targets with multiple coords produce multiple rects', () => {
    const state = resolveHighlight(
      [{ trigger: 'click', targets: [
        { type: 'cell', cells: [[1, 1], [2, 2], [3, 3]], effect: 'highlight', color: 'red' },
      ] }],
      'click',
      { gridSize: 6, cells: ctxCells, characterSlots: slots, regions },
    );
    expect(state!.cells).toHaveLength(3);
  });

  it('skips dangling references instead of throwing', () => {
    const state = resolveHighlight(
      [
        {
          trigger: 'click',
          targets: [
            { type: 'character', id: 404, effect: 'highlight', color: 'red' },
            { type: 'cell', cells: [[4, 4]], effect: 'highlight', color: 'red' },
          ],
        },
      ],
      'click',
      { gridSize: 6, cells: ctxCells, characterSlots: slots, regions },
    );
    expect(state!.characters).toHaveLength(0);
    expect(state!.cells).toHaveLength(1);
  });

  it('returns null when nothing resolves or the group is empty', () => {
    expect(resolveHighlight(
      [
        {
          trigger: 'click',
          targets: [
            { type: 'character', id: 7, effect: 'highlight', color: 'red' },
            { type: 'item', id: 12, scope: 'all', effect: 'highlight', color: 'blue' },
          ],
        },
      ],
      'click',
      {
        gridSize: 6,
        cells: cells([]),
        characterSlots: [],
        regions: [],
      },
    )).toBeNull();
    expect(resolveHighlight(undefined, 'click', {
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
      [{ trigger: 'click', targets: [
        { type: 'item', id: 12, scope: 'instances', instances: [[2, 2]], effect: 'highlight', color: 'red' },
      ] }],
      'click',
      { gridSize: 6, cells: multiCells, characterSlots: slots, regions },
    );
    expect(state!.objects).toHaveLength(1);
    expect(state!.objects[0]).toMatchObject({ x: 2, y: 2 });
  });

  it('MOD-710: blue is now accepted for region click highlight', () => {
    const state = resolveHighlight(
      [{ trigger: 'click', targets: [
        { type: 'region', id: 'rg_forest', effect: 'highlight', color: 'blue' },
      ] }],
      'click',
      { gridSize: 6, cells: ctxCells, characterSlots: slots, regions },
    );
    expect(state!.cells).toHaveLength(2);
    expect(state!.cells[0]).toMatchObject({ color: '#3B82F6' });
  });
});