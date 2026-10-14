import { beforeEach, describe, expect, it } from 'vitest';
import { CHARACTER_SLOT_COUNT } from '@murdoku/shared';
import type { MapDraft } from '@murdoku/shared';
import { useEditorStore, type RegionInput } from './editorStore';

const store = () => useEditorStore.getState();

function draft(gridSize = 6): MapDraft {
  return {
    version: 1,
    gridSize,
    cells: {},
    regions: [],
    characterSlots: Array.from({ length: CHARACTER_SLOT_COUNT }, () => null),
    placedCharacters: [],
  };
}

const regionInput = (id: string, cells: Array<[number, number]>): RegionInput => ({
  id,
  name: 'Room',
  color: '#3B82F6',
  borderWidth: 4,
  fillOpacity: 1,
  cells,
});

beforeEach(() => {
  store().init(1, draft(), { updatedAt: null, currentVersionNo: null, status: 'draft' });
});

describe('placement', () => {
  it('places a background and marks the map dirty', () => {
    store().placeBackground(7, 2, 3);
    expect(store().cells.get('2,3')).toEqual({ background: { itemId: 7 } });
    expect(store().dirty).toBe(true);
    expect(store().past).toHaveLength(1);
  });

  it('places a multi-cell object with a single anchor', () => {
    store().placeObject({ id: 5, widthCells: 2, heightCells: 2 }, 0, 0);
    expect(store().cells.get('0,0')?.object).toEqual({ itemId: 5, w: 2, h: 2 });
    expect(store().cells.get('1,0')?.object).toBeUndefined();
    expect(store().cells.has('1,1')).toBe(true);
  });

  it('removes a multi-cell object footprint together with its placeholders', () => {
    store().placeObject({ id: 2, widthCells: 2, heightCells: 2 }, 0, 0);
    store().eraseAt(1, 1);
    expect(store().cells.size).toBe(0);
  });
});

describe('characters', () => {
  it('places a character and replaces one on the same cell', () => {
    store().placeCharacter(3, 1, 1);
    expect(store().placedCharacters).toEqual([
      {
        characterId: 3,
        x: 1,
        y: 1,
        mapMeta: {},
        // FEAT-502: every participant starts with the default theme and no triggers.
        themeColor: '#FFFFFF',
        triggers: [],
        originSlotIndex: undefined,
      },
    ]);
    store().placeCharacter(4, 1, 1);
    expect(store().placedCharacters).toHaveLength(1);
    expect(store().placedCharacters[0]?.characterId).toBe(4);
  });

  it('removes a character at a coordinate', () => {
    store().placeCharacter(3, 0, 0);
    store().removeCharacterAt(0, 0);
    expect(store().placedCharacters).toHaveLength(0);
  });

  it('saves participant config as one atomic, undoable step', () => {
    store().placeCharacter(3, 0, 0);
    store().setParticipantConfig(3, {
      themeColor: '#FFCC00',
      triggers: [
        {
          trigger: 'click',
          targets: [{ type: 'cell', x: 1, y: 1, effect: 'highlight', color: 'red' }],
        },
      ],
    });
    const placed = store().placedCharacters[0];
    expect(placed?.themeColor).toBe('#FFCC00');
    expect(placed?.triggers?.[0]?.targets).toHaveLength(1);
    expect(store().dirty).toBe(true);

    store().undo();
    const restored = store().placedCharacters[0];
    expect(restored?.themeColor).toBe('#FFFFFF');
    expect(restored?.triggers).toEqual([]);
  });
});

describe('eraseAt', () => {
  // docs/v0.2.5.md BUG-406 — object layer first, background last.
  it('erases the object layer before the background layer', () => {
    store().placeBackground(1, 0, 0);
    store().placeObject({ id: 2, widthCells: 1, heightCells: 1 }, 0, 0);

    store().eraseAt(0, 0);
    expect(store().cells.get('0,0')).toEqual({ background: { itemId: 1 } });

    store().eraseAt(0, 0);
    expect(store().cells.has('0,0')).toBe(false);
  });

  it('ignores activeLayer', () => {
    store().placeBackground(1, 0, 0);
    store().placeObject({ id: 2, widthCells: 1, heightCells: 1 }, 0, 0);

    store().setLayer('background');
    store().eraseAt(0, 0);
    expect(store().cells.get('0,0')).toEqual({ background: { itemId: 1 } });

    store().setLayer('object');
    store().eraseAt(0, 0);
    expect(store().cells.has('0,0')).toBe(false);
  });

  it('does not push history for a no-op erase', () => {
    const before = store().past.length;
    store().eraseAt(0, 0);
    expect(store().past).toHaveLength(before);
    expect(store().dirty).toBe(false);
  });

  it('records two erases as two steps undone in reverse order', () => {
    store().placeBackground(1, 0, 0);
    store().placeObject({ id: 2, widthCells: 1, heightCells: 1 }, 0, 0);
    const baseline = store().past.length;

    store().eraseAt(0, 0);
    store().eraseAt(0, 0);
    expect(store().past).toHaveLength(baseline + 2);
    expect(store().cells.has('0,0')).toBe(false);

    store().undo();
    expect(store().cells.get('0,0')).toEqual({ background: { itemId: 1 } });
    store().undo();
    expect(store().cells.get('0,0')).toEqual({
      background: { itemId: 1 },
      object: { itemId: 2, w: 1, h: 1 },
    });
  });

  it('removes a character before the layers', () => {
    store().placeCharacter(3, 0, 0);
    store().eraseAt(0, 0);
    expect(store().placedCharacters).toHaveLength(0);
  });
});

describe('clearCharacterSlot', () => {
  it('frees a roster slot without touching map data', () => {
    store().setSlot(1, 12);
    const baseline = store().past.length;
    store().clearCharacterSlot(1);
    expect(store().characterSlots[1]).toBeNull();
    expect(store().dirty).toBe(true);
    expect(store().past).toHaveLength(baseline + 1);
    expect(store().placedCharacters).toHaveLength(0);
  });

  it('restores the character to the same slot on undo', () => {
    store().setSlot(0, 5);
    store().setSlot(1, 12);
    store().clearCharacterSlot(1);
    store().undo();
    expect(store().characterSlots[1]).toEqual({ characterId: 12 });
    expect(store().characterSlots[0]).toEqual({ characterId: 5 });
  });

  it('is idempotent for rapid repeated clicks', () => {
    store().setSlot(2, 8);
    store().clearCharacterSlot(2);
    const history = store().past.length;
    store().clearCharacterSlot(2);
    expect(store().past).toHaveLength(history);
  });
});

describe('placeCharacter from a roster slot', () => {
  it('clears the source slot and records its origin', () => {
    store().setSlot(3, 11);
    store().placeCharacter(11, 2, 2, 3);
    expect(store().characterSlots[3]).toBeNull();
    expect(store().placedCharacters[0]?.originSlotIndex).toBe(3);
  });

  it('rolls both arrays back on undo', () => {
    store().setSlot(3, 11);
    store().placeCharacter(11, 2, 2, 3);
    store().undo();
    expect(store().characterSlots[3]).toEqual({ characterId: 11 });
    expect(store().placedCharacters).toHaveLength(0);
  });
});

describe('history', () => {
  it('undoes and redoes a placement', () => {
    store().placeBackground(1, 0, 0);
    store().undo();
    expect(store().cells.size).toBe(0);
    store().redo();
    expect(store().cells.get('0,0')?.background).toEqual({ itemId: 1 });
  });

  it('clears the redo stack after a new action', () => {
    store().placeBackground(1, 0, 0);
    store().undo();
    expect(store().future).toHaveLength(1);
    store().placeBackground(2, 1, 1);
    expect(store().future).toHaveLength(0);
  });

  it('markSaved resets the dirty flag', () => {
    store().placeBackground(1, 0, 0);
    expect(store().dirty).toBe(true);
    store().markSaved('2026-01-01T00:00:00.000Z');
    expect(store().dirty).toBe(false);
    expect(store().updatedAt).toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('regions', () => {
  it('creates a region with the provided id and selects it', () => {
    const id = store().createRegion(regionInput('rg_a', [[0, 0], [1, 0]]), 'override');
    expect(id).toBe('rg_a');
    expect(store().selectedRegionId).toBe(id);
    expect(store().regions[0]?.cells).toEqual([[0, 0], [1, 0]]);
    expect(store().regions[0]?.labelCell).toEqual([1, 0]);
  });

  it('overrides conflicting cells from other regions', () => {
    const first = store().createRegion(regionInput('rg_a', [[0, 0], [1, 0]]), 'override');
    store().createRegion(regionInput('rg_b', [[1, 0], [2, 0]]), 'override');
    expect(store().regions.find((region) => region.id === first)?.cells).toEqual([[0, 0]]);
  });

  it('skips conflicting cells when requested', () => {
    store().createRegion(regionInput('rg_a', [[0, 0]]), 'override');
    const second = store().createRegion(regionInput('rg_b', [[0, 0], [2, 2]]), 'skip');
    expect(store().regions.find((region) => region.id === second)?.cells).toEqual([[2, 2]]);
  });

  it('toggles a cell in and out of a region', () => {
    const id = store().createRegion(regionInput('rg_a', [[0, 0]]), 'override');
    store().toggleRegionCell(id, 1, 0);
    expect(store().regions[0]?.cells).toHaveLength(2);
    store().toggleRegionCell(id, 0, 0);
    expect(store().regions[0]?.cells).toEqual([[1, 0]]);
  });

  it('updates and deletes a region', () => {
    const id = store().createRegion(regionInput('rg_a', [[0, 0]]), 'override');
    store().updateRegion(id, { ...regionInput('rg_a', [[0, 0], [0, 1]]), name: 'Hall' });
    expect(store().regions[0]?.cells).toHaveLength(2);
    expect(store().regions[0]?.name).toBe('Hall');
    expect(store().regions[0]?.labelCell).toEqual([0, 1]);
    store().deleteRegion(id);
    expect(store().regions).toHaveLength(0);
    expect(store().selectedRegionId).toBeNull();
  });
});

describe('region draft selection', () => {
  it('toggles, adds, removes and clears draft cells', () => {
    store().toggleDraftCell(0, 0);
    expect(Array.from(store().regionDraftSelection)).toEqual(['0,0']);
    store().toggleDraftCell(0, 0);
    expect(store().regionDraftSelection.size).toBe(0);

    store().addDraftCells([[1, 0], [1, 1]]);
    expect(store().regionDraftSelection.size).toBe(2);
    store().removeDraftCells([[1, 0]]);
    expect(Array.from(store().regionDraftSelection)).toEqual(['1,1']);
    store().clearDraftSelection();
    expect(store().regionDraftSelection.size).toBe(0);
  });

  it('clears the draft when switching away from the region tool', () => {
    store().setTool('region');
    store().addDraftCells([[0, 0]]);
    store().setTool('region');
    expect(store().regionDraftSelection.size).toBe(1);
    store().setTool('select');
    expect(store().regionDraftSelection.size).toBe(0);
  });
});

describe('selection', () => {
  it('stores typed cell, region and character selections', () => {
    store().setSelection({ type: 'cell', x: 1, y: 2 });
    expect(store().selection).toEqual({ type: 'cell', x: 1, y: 2 });
    store().setSelection({ type: 'region', regionId: 'rg_a' });
    expect(store().selection).toEqual({ type: 'region', regionId: 'rg_a' });
    store().setSelection({ type: 'character', characterId: 3, x: 1, y: 2 });
    expect(store().selection).toEqual({ type: 'character', characterId: 3, x: 1, y: 2 });
    store().setSelection(null);
    expect(store().selection).toBeNull();
  });
});

describe('cell clearing', () => {
  it('clears a cell object and then the whole cell', () => {
    store().placeBackground(1, 0, 0);
    store().placeObject({ id: 2, widthCells: 1, heightCells: 1 }, 0, 0);
    store().clearObjectAt(0, 0);
    expect(store().cells.get('0,0')).toEqual({ background: { itemId: 1 } });
    store().clearCell(0, 0);
    expect(store().cells.has('0,0')).toBe(false);
  });
});

describe('placed metadata', () => {
  it('updates the map meta of a placed character', () => {
    store().placeCharacter(3, 1, 1);
    store().setPlacedMeta(1, 1, { room: 'A' });
    expect(store().placedCharacters[0]?.mapMeta).toEqual({ room: 'A' });
  });
});

describe('character roster', () => {
  it('assigns and clears a slot', () => {
    store().setSlot(0, 9);
    expect(store().characterSlots[0]).toEqual({ characterId: 9 });
    store().setSlot(0, null);
    expect(store().characterSlots[0]).toBeNull();
  });

  it('swaps two slots for drag reordering', () => {
    store().setSlot(0, 9);
    store().setSlot(1, 4);
    store().swapSlots(0, 1);
    expect(store().characterSlots[0]).toEqual({ characterId: 4 });
    expect(store().characterSlots[1]).toEqual({ characterId: 9 });
  });

  it('sizes the roster to the grid size', () => {
    expect(store().characterSlots).toHaveLength(6);
    store().setGridSize(4);
    expect(store().characterSlots).toHaveLength(4);
  });
});

describe('returnCharacterToSlot', () => {
  it('frees the origin slot on placement and restores it on removal', () => {
    store().setSlot(2, 9);
    store().placeCharacter(9, 1, 1);
    expect(store().characterSlots[2]).toBeNull();
    expect(store().placedCharacters[0]?.originSlotIndex).toBe(2);

    expect(store().returnCharacterToSlot(9)).toBe(true);
    expect(store().characterSlots[2]).toEqual({ characterId: 9 });
    expect(store().placedCharacters).toHaveLength(0);
  });

  it('rolls both placed and slots back on undo', () => {
    store().setSlot(0, 4);
    store().placeCharacter(4, 2, 2);
    store().undo();
    expect(store().characterSlots[0]).toEqual({ characterId: 4 });
    expect(store().placedCharacters).toHaveLength(0);
    store().redo();
    expect(store().characterSlots[0]).toBeNull();
    expect(store().placedCharacters).toHaveLength(1);
  });

  it('fails without side effects when no slot is available', () => {
    for (let i = 0; i < store().characterSlots.length; i += 1) store().setSlot(i, 100 + i);
    store().placeCharacter(999, 0, 0);
    expect(store().returnCharacterToSlot(999)).toBe(false);
    expect(store().placedCharacters).toHaveLength(1);
  });

  it('returns false when the character is not placed', () => {
    expect(store().returnCharacterToSlot(42)).toBe(false);
  });

  it('does not duplicate an already occupied slot', () => {
    store().setSlot(1, 7);
    store().placeCharacter(7, 0, 0);
    store().setSlot(1, 7);
    expect(store().returnCharacterToSlot(7)).toBe(true);
    expect(store().characterSlots.filter((slot) => slot?.characterId === 7)).toHaveLength(1);
    expect(store().placedCharacters).toHaveLength(0);
  });
});

describe('grid resize', () => {
  it('crops out-of-bounds cells, regions and characters', () => {
    store().placeBackground(1, 5, 5);
    store().placeCharacter(2, 5, 5);
    store().createRegion(regionInput('rg_a', [[5, 5]]), 'override');
    store().setGridSize(3);
    expect(store().gridSize).toBe(3);
    expect(store().cells.has('5,5')).toBe(false);
    expect(store().placedCharacters).toHaveLength(0);
    expect(store().regions).toHaveLength(0);
  });
});

describe('init', () => {
  it('hydrates a draft without marking it dirty', () => {
    const loaded = draft(4);
    loaded.cells['0,0'] = { object: { itemId: 3, w: 1, h: 1 } };
    loaded.regions = [
      { id: 'rg_x', name: 'Loaded', color: '#3B82F6', borderWidth: 4, fillOpacity: 1, cells: [[0, 0]] },
    ];
    loaded.placedCharacters = [{ characterId: 8, x: 2, y: 2, mapMeta: {} }];
    store().init(9, loaded, { updatedAt: '2026-01-01T00:00:00.000Z', currentVersionNo: 2, status: 'published' });

    expect(store().projectId).toBe(9);
    expect(store().gridSize).toBe(4);
    expect(store().cells.get('0,0')?.object?.itemId).toBe(3);
    expect(store().regions).toHaveLength(1);
    expect(store().placedCharacters).toHaveLength(1);
    expect(store().currentVersionNo).toBe(2);
    expect(store().status).toBe('published');
    expect(store().past).toHaveLength(0);
    expect(store().dirty).toBe(false);
  });
});

describe('toDraft', () => {
  it('serialises cells, regions, slots and characters', () => {
    store().placeObject({ id: 5, widthCells: 1, heightCells: 1 }, 1, 1);
    store().setSlot(0, 4);
    const output = store().toDraft();
    expect(output.version).toBe(1);
    expect(output.cells['1,1']?.object).toEqual({ itemId: 5, w: 1, h: 1 });
    expect(output.characterSlots[0]).toEqual({ characterId: 4 });
    expect(output.placedCharacters).toEqual([]);
  });
});
