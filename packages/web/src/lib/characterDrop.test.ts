import { describe, expect, it } from 'vitest';
import type { DraftCell, Item, PlacedCharacter } from '@murdoku/shared';
import {
  DROP_REJECTION_MESSAGES,
  validateCharacterDrop,
  type CharacterDropInput,
} from './characterDrop';
import type { CellMap } from './hitTest';

function map(entries: Record<string, DraftCell>): CellMap {
  return new Map(Object.entries(entries));
}

function item(id: number, canStand: boolean): Item {
  return {
    id,
    code: `i${id}`,
    name: `item-${id}`,
    category: 'object',
    widthCells: 1,
    heightCells: 1,
    canStand,
    fitMode: 'cover',
    imagePath: null,
    imageUrl: null,
    imageThumbUrl: null,
    imageMime: null,
    imageSize: null,
    imageWidth: null,
    imageHeight: null,
    meta: {},
    isActive: true,
    triggers: [],
    createdAt: '',
    updatedAt: '',
  };
}

function input(overrides: Partial<CharacterDropInput> = {}): CharacterDropInput {
  return {
    cell: { x: 1, y: 1 },
    gridSize: 6,
    cells: map({}),
    placedCharacters: [],
    characterId: 1,
    itemsById: new Map<number, Item>(),
    ...overrides,
  };
}

describe('validateCharacterDrop', () => {
  it('accepts an empty cell inside the board', () => {
    expect(validateCharacterDrop(input())).toEqual({ ok: true });
  });

  it('accepts a cell holding a standable item', () => {
    const cells = map({ '1,1': { object: { itemId: 3, w: 1, h: 1 } } });
    const itemsById = new Map<number, Item>([[3, item(3, true)]]);
    expect(validateCharacterDrop(input({ cells, itemsById }))).toEqual({ ok: true });
  });

  it('rejects a cell outside the board', () => {
    expect(validateCharacterDrop(input({ cell: { x: 6, y: 1 } }))).toEqual({
      ok: false,
      reason: 'out-of-bounds',
    });
    expect(validateCharacterDrop(input({ cell: { x: -1, y: 1 } }))).toEqual({
      ok: false,
      reason: 'out-of-bounds',
    });
  });

  it('rejects a cell already taken by another character', () => {
    const placedCharacters: PlacedCharacter[] = [
      { characterId: 2, x: 1, y: 1, mapMeta: {} },
    ];
    expect(validateCharacterDrop(input({ placedCharacters }))).toEqual({
      ok: false,
      reason: 'occupied',
    });
  });

  it('allows the dragged character to stay on its own cell', () => {
    const placedCharacters: PlacedCharacter[] = [
      { characterId: 1, x: 1, y: 1, mapMeta: {} },
    ];
    expect(validateCharacterDrop(input({ placedCharacters }))).toEqual({ ok: true });
  });

  it('rejects a cell whose item cannot be stood on', () => {
    const cells = map({ '1,1': { object: { itemId: 4, w: 1, h: 1 } } });
    const itemsById = new Map<number, Item>([[4, item(4, false)]]);
    expect(validateCharacterDrop(input({ cells, itemsById }))).toEqual({
      ok: false,
      reason: 'not-standable',
    });
  });

  it('checks bounds before occupancy', () => {
    const placedCharacters: PlacedCharacter[] = [
      { characterId: 2, x: 9, y: 9, mapMeta: {} },
    ];
    expect(validateCharacterDrop(input({ cell: { x: 9, y: 9 }, placedCharacters }))).toEqual({
      ok: false,
      reason: 'out-of-bounds',
    });
  });
});

describe('drop rejection messages', () => {
  it('matches the copy required by the spec', () => {
    expect(DROP_REJECTION_MESSAGES['out-of-bounds']).toBe('请拖入画布区域');
    expect(DROP_REJECTION_MESSAGES.occupied).toBe('该格已有角色');
    expect(DROP_REJECTION_MESSAGES['not-standable']).toBe('该格不可站角色');
  });
});
