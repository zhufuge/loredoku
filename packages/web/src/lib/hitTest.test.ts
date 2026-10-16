import { describe, expect, it } from 'vitest';
import type { DraftCell } from '@loredoku/shared';
import { hitTestCell, resolveObjectAnchor, type CellMap } from './hitTest';

function map(entries: Record<string, DraftCell>): CellMap {
  return new Map(Object.entries(entries));
}

describe('resolveObjectAnchor', () => {
  it('maps every covered cell of a multi-cell object back to its anchor', () => {
    const cells = map({
      '2,2': { object: { itemId: 9, w: 2, h: 2 } },
      '3,2': {},
      '2,3': {},
      '3,3': {},
    });
    expect(resolveObjectAnchor(cells, 2, 2)).toEqual([2, 2]);
    expect(resolveObjectAnchor(cells, 3, 2)).toEqual([2, 2]);
    expect(resolveObjectAnchor(cells, 2, 3)).toEqual([2, 2]);
    expect(resolveObjectAnchor(cells, 3, 3)).toEqual([2, 2]);
    expect(resolveObjectAnchor(cells, 4, 2)).toBeNull();
  });

  it('keeps a background-only cell transparent to object anchors', () => {
    const cells = map({ '0,0': { background: { itemId: 1 } } });
    expect(resolveObjectAnchor(cells, 0, 0)).toBeNull();
  });
});

describe('hitTestCell', () => {
  const cells = map({
    '0,0': { background: { itemId: 1 } },
    '4,4': { object: { itemId: 5, w: 2, h: 1 } },
    '5,4': {},
  });

  // CLAR-603: characters no longer occupy cells, so all branches resolve to
  // a cell selection (no `character` branch any more).

  it('selects a plain cell when nothing is stacked', () => {
    expect(hitTestCell({ x: 1, y: 1, gridSize: 6, cells })).toEqual({
      type: 'cell',
      x: 1,
      y: 1,
    });
  });

  it('selects the background cell that carries an item', () => {
    expect(hitTestCell({ x: 0, y: 0, gridSize: 6, cells })).toEqual({
      type: 'cell',
      x: 0,
      y: 0,
    });
  });

  it('selects the anchor of a multi-cell object from any covered cell', () => {
    expect(hitTestCell({ x: 4, y: 4, gridSize: 6, cells })).toEqual({
      type: 'cell',
      x: 4,
      y: 4,
    });
    expect(hitTestCell({ x: 5, y: 4, gridSize: 6, cells })).toEqual({
      type: 'cell',
      x: 4,
      y: 4,
    });
  });

  it('returns null outside the board (click on empty margin clears selection)', () => {
    expect(hitTestCell({ x: 6, y: 0, gridSize: 6, cells })).toBeNull();
    expect(hitTestCell({ x: -1, y: 0, gridSize: 6, cells })).toBeNull();
  });
});
