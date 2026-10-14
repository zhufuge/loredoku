import type { DraftCell, Item, PlacedCharacter } from '@murdoku/shared';
import type { CellMap } from './hitTest';

export type DropRejection = 'out-of-bounds' | 'occupied' | 'not-standable';

export const DROP_REJECTION_MESSAGES: Record<DropRejection, string> = {
  'out-of-bounds': '请拖入画布区域',
  occupied: '该格已有角色',
  'not-standable': '该格不可站角色',
};

export type DropCheck = { ok: true } | { ok: false; reason: DropRejection };

export interface CharacterDropInput {
  cell: { x: number; y: number };
  gridSize: number;
  cells: CellMap;
  placedCharacters: PlacedCharacter[];
  characterId: number;
  itemsById: Map<number, Item>;
}

/**
 * Validates dropping a roster character onto a map cell.
 * Order matters: bounds → occupied → standable.
 */
export function validateCharacterDrop({
  cell,
  gridSize,
  cells,
  placedCharacters,
  characterId,
  itemsById,
}: CharacterDropInput): DropCheck {
  if (cell.x < 0 || cell.y < 0 || cell.x >= gridSize || cell.y >= gridSize) {
    return { ok: false, reason: 'out-of-bounds' };
  }
  const occupied = placedCharacters.some(
    (placed) => placed.x === cell.x && placed.y === cell.y && placed.characterId !== characterId,
  );
  if (occupied) return { ok: false, reason: 'occupied' };

  const objectItem = cells.get(`${cell.x},${cell.y}`)?.object;
  if (objectItem) {
    const item = itemsById.get(objectItem.itemId);
    if (item && !item.canStand) return { ok: false, reason: 'not-standable' };
  }
  return { ok: true };
}
