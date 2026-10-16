import { describe, expect, it } from 'vitest';
import type { DraftCell } from '@loredoku/shared';
import {
  isEmptyCell,
  objectFootprintKeys,
  resolveEraseTarget,
  type EraseTarget,
} from './erase';
import type { CellMap } from './hitTest';

function map(entries: Record<string, DraftCell>): CellMap {
  return new Map(Object.entries(entries));
}

// CLAR-603: the character layer is gone; tests cover only objects / background.

describe('resolveEraseTarget', () => {
  it('returns null for an empty cell', () => {
    expect(resolveEraseTarget(map({}), 0, 0)).toBeNull();
    expect(resolveEraseTarget(map({ '0,0': {} }), 0, 0)).toBeNull();
  });

  it('clears the object first when both layers are stacked', () => {
    const cells = map({
      '0,0': { background: { itemId: 1 }, object: { itemId: 2, w: 1, h: 1 } },
    });
    expect(resolveEraseTarget(cells, 0, 0)).toEqual({
      layer: 'object',
      key: '0,0',
      x: 0,
      y: 0,
    });
  });

  it('clears the background when only that layer is present', () => {
    const cells = map({ '0,0': { background: { itemId: 1 } } });
    expect(resolveEraseTarget(cells, 0, 0)).toEqual({
      layer: 'background',
      key: '0,0',
      x: 0,
      y: 0,
    });
  });

  it('clears the object when only that layer is present', () => {
    const cells = map({ '0,0': { object: { itemId: 2, w: 1, h: 1 } } });
    expect(resolveEraseTarget(cells, 0, 0)).toEqual({
      layer: 'object',
      key: '0,0',
      x: 0,
      y: 0,
    });
  });

  it('resolves a covered cell to the object anchor', () => {
    const cells = map({
      '2,2': { object: { itemId: 5, w: 2, h: 2 } },
      '3,2': { background: { itemId: 1 } },
      '2,3': {},
      '3,3': {},
    });
    const target = resolveEraseTarget(cells, 3, 3) as EraseTarget;
    expect(target.layer).toBe('object');
    expect(target.key).toBe('2,2');
    expect([target.x, target.y]).toEqual([2, 2]);
  });
});

describe('objectFootprintKeys', () => {
  it('lists the anchor and its placeholder cells', () => {
    expect(objectFootprintKeys({ w: 2, h: 2 }, 2, 2)).toEqual([
      '2,2',
      '3,2',
      '2,3',
      '3,3',
    ]);
  });
});

describe('isEmptyCell', () => {
  it('treats missing and empty cells as removable', () => {
    expect(isEmptyCell(undefined)).toBe(true);
    expect(isEmptyCell({})).toBe(true);
    expect(isEmptyCell({ background: { itemId: 1 } })).toBe(false);
    expect(isEmptyCell({ object: { itemId: 1, w: 1, h: 1 } })).toBe(false);
  });
});
