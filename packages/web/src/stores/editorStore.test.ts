import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_THEME_COLOR } from '@murdoku/shared';
import type { MapDraft, ParticipantTarget } from '@murdoku/shared';
import { useEditorStore, type RegionInput } from './editorStore';

const store = () => useEditorStore.getState();

function draft(gridSize = 6): MapDraft {
  return {
    version: 1,
    gridSize,
    cells: {},
    regions: [],
    characterSlots: Array.from({ length: gridSize }, () => null),
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
});

describe('clearCharacterSlot', () => {
  it('frees a roster slot without touching map data', () => {
    store().setSlot(1, 12);
    const baseline = store().past.length;
    store().clearCharacterSlot(1);
    expect(store().characterSlots[1]).toBeNull();
    expect(store().dirty).toBe(true);
    expect(store().past).toHaveLength(baseline + 1);
  });

  it('restores the character to the same slot on undo', () => {
    store().setSlot(0, 5);
    store().setSlot(1, 12);
    store().clearCharacterSlot(1);
    store().undo();
    expect(store().characterSlots[1]).toMatchObject({ characterId: 12 });
    expect(store().characterSlots[0]).toMatchObject({ characterId: 5 });
  });

  it('is idempotent for rapid repeated clicks', () => {
    store().setSlot(2, 8);
    store().clearCharacterSlot(2);
    const history = store().past.length;
    store().clearCharacterSlot(2);
    expect(store().past).toHaveLength(history);
  });
});

describe('setSlot preserves participant config', () => {
  it('keeps existing themeColor / linkages when reassigning a slot', () => {
    store().setSlot(0, 4);
    store().setParticipantConfig(0, { themeColor: '#FFCC00', linkages: [] });
    // Reassigning via setSlot(0, 4) (no-op) preserves the participant config.
    store().setSlot(0, 4);
    expect(store().characterSlots[0]).toMatchObject({
      characterId: 4,
      themeColor: '#FFCC00',
    });
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
  it('stores typed cell and region selections (CLAR-603: no character selection)', () => {
    store().setSelection({ type: 'cell', x: 1, y: 2 });
    expect(store().selection).toEqual({ type: 'cell', x: 1, y: 2 });
    store().setSelection({ type: 'region', regionId: 'rg_a' });
    expect(store().selection).toEqual({ type: 'region', regionId: 'rg_a' });
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

describe('setParticipantConfig (CLAR-603 + MOD-801)', () => {
  it('persists theme + flat linkages on the roster slot as one atomic step', () => {
    store().setSlot(2, 9);
    store().setParticipantConfig(2, {
      themeColor: '#FFCC00',
      linkages: [
        { type: 'cell', cells: [[1, 1]], effect: 'highlight', color: 'red' },
        { type: 'region', id: 'rg_a', effect: 'highlight', color: 'blue' },
      ],
    });
    const slot = store().characterSlots[2];
    expect(slot?.themeColor).toBe('#FFCC00');
    expect(slot?.linkages).toHaveLength(2);
    expect(slot?.linkages?.[0]).toMatchObject({ type: 'cell', color: 'red' });
    // MOD-801: the legacy grouped `triggers` field is gone.
    expect(slot && 'triggers' in slot).toBe(false);
    expect(store().dirty).toBe(true);

    store().undo();
    const restored = store().characterSlots[2];
    expect(restored?.themeColor).toBe(DEFAULT_THEME_COLOR);
    expect(restored?.linkages).toEqual([]);
  });

  it('defensively copies the linkages array and its entries', () => {
    store().setSlot(1, 3);
    const linkages: ParticipantTarget[] = [
      { type: 'cell', cells: [[0, 1]], effect: 'highlight', color: 'red' },
    ];
    store().setParticipantConfig(1, { linkages });
    const stored = store().characterSlots[1]?.linkages?.[0];
    expect(stored).not.toBe(linkages[0]);
    expect(stored).toMatchObject({ type: 'cell', cells: [[0, 1]] });
  });
});

describe('MOD-802 linkage activation (single-active state machine)', () => {
  it('starts inactive and hover-activates on enter', () => {
    expect(store().activeParticipantId).toBeNull();
    expect(store().activationMode).toBeNull();
    store().activateParticipantHover(2);
    expect(store().activeParticipantId).toBe(2);
    expect(store().activationMode).toBe('hover');
  });

  it('ends a hover activation when the pointer leaves the same slot', () => {
    store().activateParticipantHover(2);
    store().deactivateParticipantHover(2);
    expect(store().activeParticipantId).toBeNull();
    expect(store().activationMode).toBeNull();
  });

  it('switches hover activation directly to the newly entered slot', () => {
    store().activateParticipantHover(2);
    store().activateParticipantHover(5);
    expect(store().activeParticipantId).toBe(5);
  });

  it('click toggles a pinned activation and ignores hover on the same slot', () => {
    store().activateParticipantClick(1);
    expect(store().activationMode).toBe('click');
    // §1.2.4: hovering the pinned participant must not change anything.
    store().activateParticipantHover(1);
    expect(store().activeParticipantId).toBe(1);
    expect(store().activationMode).toBe('click');
    store().deactivateParticipantHover(1);
    expect(store().activeParticipantId).toBe(1);
    store().activateParticipantClick(1);
    expect(store().activeParticipantId).toBeNull();
  });

  it('entering another slot auto-ends the previous activation', () => {
    store().activateParticipantClick(1);
    store().activateParticipantHover(4);
    expect(store().activeParticipantId).toBe(4);
    expect(store().activationMode).toBe('hover');
  });

  it('clearActivation force-clears (Esc)', () => {
    store().activateParticipantClick(3);
    store().clearActivation();
    expect(store().activeParticipantId).toBeNull();
    expect(store().activationMode).toBeNull();
  });

  it('resets the activation on init and applyDraft', () => {
    store().activateParticipantClick(2);
    store().init(9, draft(4), {
      updatedAt: '2026-01-01T00:00:00.000Z',
      currentVersionNo: 1,
      status: 'draft',
    });
    expect(store().activeParticipantId).toBeNull();

    store().activateParticipantHover(1);
    store().applyDraft(draft(4));
    expect(store().activeParticipantId).toBeNull();
    expect(store().activationMode).toBeNull();
  });
});

describe('character roster', () => {
  it('assigns and clears a slot', () => {
    store().setSlot(0, 9);
    expect(store().characterSlots[0]).toMatchObject({ characterId: 9 });
    store().setSlot(0, null);
    expect(store().characterSlots[0]).toBeNull();
  });

  it('swaps two slots for drag reordering', () => {
    store().setSlot(0, 9);
    store().setSlot(1, 4);
    store().swapSlots(0, 1);
    expect(store().characterSlots[0]).toMatchObject({ characterId: 4 });
    expect(store().characterSlots[1]).toMatchObject({ characterId: 9 });
  });

  it('sizes the roster to the grid size', () => {
    expect(store().characterSlots).toHaveLength(6);
    store().setGridSize(4);
    expect(store().characterSlots).toHaveLength(4);
  });
});

describe('grid resize', () => {
  it('crops out-of-bounds cells and regions', () => {
    store().placeBackground(1, 5, 5);
    store().createRegion(regionInput('rg_a', [[5, 5]]), 'override');
    store().setGridSize(3);
    expect(store().gridSize).toBe(3);
    expect(store().cells.has('5,5')).toBe(false);
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
    loaded.characterSlots = [
      { characterId: 8, themeColor: '#FFCC00', linkages: [] },
      null,
      null,
      null,
    ];
    store().init(9, loaded, { updatedAt: '2026-01-01T00:00:00.000Z', currentVersionNo: 2, status: 'published' });

    expect(store().projectId).toBe(9);
    expect(store().gridSize).toBe(4);
    expect(store().cells.get('0,0')?.object?.itemId).toBe(3);
    expect(store().regions).toHaveLength(1);
    expect(store().characterSlots[0]).toMatchObject({ characterId: 8, themeColor: '#FFCC00' });
    expect(store().currentVersionNo).toBe(2);
    expect(store().status).toBe('published');
    expect(store().past).toHaveLength(0);
    expect(store().dirty).toBe(false);
  });
});

describe('toDraft', () => {
  it('serialises cells, regions, slots with theme + linkages', () => {
    store().placeObject({ id: 5, widthCells: 1, heightCells: 1 }, 1, 1);
    store().setSlot(0, 4);
    const output = store().toDraft();
    // v0.3.8: the draft may carry a `style` block, so the JSON version is 2.
    expect(output.version).toBe(2);
    expect(output.cells['1,1']?.object).toEqual({ itemId: 5, w: 1, h: 1 });
    expect(output.characterSlots[0]).toMatchObject({ characterId: 4, linkages: [] });
    // CLAR-603: there is no placedCharacters field any more.
    expect('placedCharacters' in output).toBe(false);
    // MOD-801: every serialised slot carries `linkages`, never `triggers`.
    for (const slot of output.characterSlots) {
      if (!slot) continue;
      expect('triggers' in slot).toBe(false);
      expect(Array.isArray(slot.linkages)).toBe(true);
    }
  });

  it('FEAT-D02: serialises the resolved map style', () => {
    const output = store().toDraft();
    expect(output.style?.border).toEqual({ width: 2, color: '#000000' });
    expect(output.style?.linkageColors.map((entry) => entry.key)).toEqual(['red', 'blue']);
  });
});

describe('map style (v0.3.8 FEAT-D02/D03/D04)', () => {
  it('starts from the shipped defaults and is always fully resolved', () => {
    const style = store().style;
    expect(style.cellSize).toBeNull();
    expect(style.canvasFrame.width).toBe(6);
    expect(style.regionLabel.fontSize).toBe(17);
  });

  it('adopts the style block of the loaded draft', () => {
    store().init(
      2,
      {
        ...draft(),
        style: {
          cellSize: 150,
          border: { width: 4, color: '#112233' },
        },
      } as MapDraft,
      { updatedAt: null, currentVersionNo: null, status: 'draft' },
    );
    expect(store().style.cellSize).toBe(150);
    expect(store().style.border).toEqual({ width: 4, color: '#112233' });
    // Untouched fields keep their defaults.
    expect(store().style.canvasFrame).toEqual({ width: 6, color: '#000000' });
  });

  it('setMapStyle commits one undoable step and clamps the result', () => {
    store().setMapStyle((current) => ({
      ...current,
      canvasFrame: { ...current.canvasFrame, width: 99 },
    }));
    expect(store().style.canvasFrame.width).toBe(12);
    expect(store().dirty).toBe(true);
    expect(store().past).toHaveLength(1);
    store().undo();
    expect(store().style.canvasFrame.width).toBe(6);
  });

  it('setCellSizeOverride stores an integer and null restores adaptivity', () => {
    store().setCellSizeOverride(123.6);
    expect(store().style.cellSize).toBe(124);
    store().setCellSizeOverride(10);
    expect(store().style.cellSize).toBe(90);
    store().setCellSizeOverride(null);
    expect(store().style.cellSize).toBeNull();
  });

  it('FEAT-D02 §关键规则 4: the region outline width syncs to every region', () => {
    store().createRegion(regionInput('rg_a', [[0, 0]]), 'override');
    store().createRegion(regionInput('rg_b', [[2, 2]]), 'override');
    store().applyRegionBorderStyle({ width: 10 });
    expect(store().style.regionBorder.width).toBe(10);
    expect(store().regions.map((region) => region.borderWidth)).toEqual([10, 10]);
  });

  it('FEAT-D02 §关键规则 4: the region outline colour is map-level only', () => {
    store().createRegion(regionInput('rg_a', [[0, 0]]), 'override');
    store().applyRegionBorderStyle({ color: '#FF0000' });
    expect(store().style.regionBorder.color).toBe('#FF0000');
    // The region keeps its own colour — it drives the fill.
    expect(store().regions[0]?.color).toBe('#3B82F6');
    // ...and its width is untouched when only the colour changed.
    expect(store().regions[0]?.borderWidth).toBe(4);
  });

  it('FEAT-D04: removing a palette entry re-points the linkages that used it', () => {
    store().setLinkageColors([
      { key: 'red', label: '红', color: '#EF9A9A' },
      { key: 'blue', label: '蓝', color: '#90CAF9' },
      { key: 'teal', label: '青', color: '#0B7E74' },
    ]);
    store().setSlot(0, 4);
    store().setParticipantConfig(0, {
      linkages: [
        { type: 'cell', cells: [[0, 0]], effect: 'highlight', color: 'blue' },
        { type: 'cell', cells: [[1, 1]], effect: 'highlight', color: 'teal' },
      ],
    });
    store().removeLinkageColor('blue');
    // The removed key is gone and its references point at the first entry.
    expect(store().style.linkageColors.map((entry) => entry.key)).toEqual(['red', 'teal']);
    expect(store().characterSlots[0]?.linkages?.map((entry) => entry.color)).toEqual([
      'red',
      'teal',
    ]);
  });

  it('FEAT-D04 §下限: refuses to drop below the 2-entry minimum', () => {
    store().removeLinkageColor('blue');
    expect(store().style.linkageColors.map((entry) => entry.key)).toEqual(['red', 'blue']);
    // Nothing was committed either — a rejected removal must not dirty the map.
    expect(store().past).toHaveLength(0);
  });

  it('FEAT-D04: setLinkageColors adds an entry through the schema guard', () => {
    store().setLinkageColors([
      { key: 'red', label: '红', color: '#EF9A9A' },
      { key: 'teal', label: '青', color: '#0B7E74' },
    ]);
    expect(store().style.linkageColors[1]).toEqual({
      key: 'teal',
      label: '青',
      color: '#0B7E74',
    });
  });

  it('applyDraft adopts the imported style and resets the history', () => {
    store().setMapStyle((current) => ({ ...current, border: { ...current.border, width: 8 } }));
    store().applyDraft({ ...draft(), style: { cellSize: 200 } } as MapDraft);
    expect(store().style.cellSize).toBe(200);
    expect(store().style.border.width).toBe(2);
    expect(store().dirty).toBe(true);
  });
});
