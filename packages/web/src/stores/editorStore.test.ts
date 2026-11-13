import { beforeEach, describe, expect, it } from 'vitest';
import type { MapDraft, RegionStyle } from '@loredoku/shared';
import { DEFAULT_MAP_STYLE, MAP_JSON_VERSION } from '@loredoku/shared';
import { useEditorStore, type RegionInput } from './editorStore';

const store = () => useEditorStore.getState();

/**
 * v0.5.0 SPEC-K12 §9.2: the map editor's store lost the whole participant half
 * (`characterSlots`, `setParticipantConfig`, `assignSlot`, the activation
 * machine and the linkage palette). Those tests moved to `puzzleStore.test.ts`
 * together with the code — what is left here is the canvas / style / undo stack.
 */
function draft(gridSize = 6): MapDraft {
  return {
    version: 3,
    gridSize,
    cells: {},
    regions: [],
  };
}

const regionInput = (id: string, cells: Array<[number, number]>, style?: RegionInput['style']): RegionInput => ({
  id,
  name: 'Room',
  cells,
  ...(style ? { style } : {}),
});

beforeEach(() => {
  store().init(1, draft(), { currentVersionNo: null, status: 'draft' });
});

describe('placement', () => {
  it('places a background and marks the map dirty', () => {
    store().placeBackground(7, 41, 2, 3);
    expect(store().cells.get('2,3')).toEqual({ background: { assetId: 7, variantId: 41 } });
    expect(store().dirty).toBe(true);
    expect(store().past).toHaveLength(1);
  });

  it('leaves the variant out when the caller has none to name', () => {
    store().placeBackground(7, undefined, 2, 3);
    expect(store().cells.get('2,3')).toEqual({ background: { assetId: 7 } });
  });

  it('places a multi-cell object with a single anchor', () => {
    store().placeItem({ assetId: 5, variantId: 1, w: 2, h: 2 }, 0, 0);
    expect(store().cells.get('0,0')?.item).toEqual({ assetId: 5, variantId: 1, w: 2, h: 2 });
    expect(store().cells.get('1,0')?.item).toBeUndefined();
    expect(store().cells.has('1,1')).toBe(true);
  });

  it('removes a multi-cell object footprint together with its placeholders', () => {
    store().placeItem({ assetId: 2, variantId: 1, w: 2, h: 2 }, 0, 0);
    store().eraseAt(1, 1);
    expect(store().cells.size).toBe(0);
  });
});

describe('eraseAt', () => {
  // docs/v0.2.5.md BUG-406 — object layer first, background last.
  it('erases the object layer before the background layer', () => {
    store().placeBackground(1, 11, 0, 0);
    store().placeItem({ assetId: 2, variantId: 1, w: 1, h: 1 }, 0, 0);

    store().eraseAt(0, 0);
    expect(store().cells.get('0,0')).toEqual({ background: { assetId: 1, variantId: 11 } });

    store().eraseAt(0, 0);
    expect(store().cells.has('0,0')).toBe(false);
  });

  it('ignores activeLayer', () => {
    store().placeBackground(1, 11, 0, 0);
    store().placeItem({ assetId: 2, variantId: 1, w: 1, h: 1 }, 0, 0);

    store().setLayer('background');
    store().eraseAt(0, 0);
    expect(store().cells.get('0,0')).toEqual({ background: { assetId: 1, variantId: 11 } });

    store().setLayer('item');
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
    store().placeBackground(1, 11, 0, 0);
    store().placeItem({ assetId: 2, variantId: 1, w: 1, h: 1 }, 0, 0);
    const baseline = store().past.length;

    store().eraseAt(0, 0);
    store().eraseAt(0, 0);
    expect(store().past).toHaveLength(baseline + 2);
    expect(store().cells.has('0,0')).toBe(false);

    store().undo();
    expect(store().cells.get('0,0')).toEqual({ background: { assetId: 1, variantId: 11 } });
    store().undo();
    expect(store().cells.get('0,0')).toEqual({
      background: { assetId: 1, variantId: 11 },
      item: { assetId: 2, variantId: 1, w: 1, h: 1 },
    });
  });
});

describe('history', () => {
  it('undoes and redoes a placement', () => {
    store().placeBackground(1, 11, 0, 0);
    store().undo();
    expect(store().cells.size).toBe(0);
    store().redo();
    expect(store().cells.get('0,0')?.background).toEqual({ assetId: 1, variantId: 11 });
  });

  it('clears the redo stack after a new action', () => {
    store().placeBackground(1, 11, 0, 0);
    store().undo();
    expect(store().future).toHaveLength(1);
    store().placeBackground(2, 12, 1, 1);
    expect(store().future).toHaveLength(0);
  });

  it('markSaved resets the dirty flag', () => {
    store().placeBackground(1, 11, 0, 0);
    expect(store().dirty).toBe(true);
    // markSaved 不收修订号。
    store().markSaved();
    expect(store().dirty).toBe(false);
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
    store().placeBackground(1, 11, 0, 0);
    store().placeItem({ assetId: 2, variantId: 1, w: 1, h: 1 }, 0, 0);
    store().clearItemAt(0, 0);
    expect(store().cells.get('0,0')).toEqual({ background: { assetId: 1, variantId: 11 } });
    store().clearCell(0, 0);
    expect(store().cells.has('0,0')).toBe(false);
  });
});

describe('grid resize', () => {
  it('crops out-of-bounds cells and regions', () => {
    store().placeBackground(1, 11, 5, 5);
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
    loaded.cells['0,0'] = { item: { assetId: 3, w: 1, h: 1 } };
    loaded.regions = [
      {
        id: 'rg_x',
        name: 'Loaded',
        cells: [[0, 0]],
        style: { outline: { width: 6 } },
      },
    ];
    store().init(9, loaded, { currentVersionNo: 2, status: 'published' });

    expect(store().mapId).toBe(9);
    expect(store().gridSize).toBe(4);
    expect(store().cells.get('0,0')?.item?.assetId).toBe(3);
    expect(store().regions).toHaveLength(1);
    expect(store().currentVersionNo).toBe(2);
    expect(store().status).toBe('published');
    expect(store().past).toHaveLength(0);
    expect(store().dirty).toBe(false);
  });
});

describe('toDraft (FEAT-K14: MapDraft v3)', () => {
  it('serialises cells and regions — and carries no roster (SPEC-K12)', () => {
    store().placeItem({ assetId: 5, variantId: 1, w: 1, h: 1 }, 1, 1);
    const output = store().toDraft();
    // the map JSON is v7 — regions carry only their style differences;
    // participants live in the puzzle.
    expect(output.version).toBe(MAP_JSON_VERSION);
    expect(output.cells['1,1']?.item).toEqual({ assetId: 5, variantId: 1, w: 1, h: 1 });
    expect('characterSlots' in output).toBe(false);
    expect('placedCharacters' in output).toBe(false);
  });

  it('FEAT-D02: serialises the resolved map style — without the palette (Q16)', () => {
    const output = store().toDraft();
    // v0.5.2 SPEC-M07: the grid separator now defaults to 4px.
    expect(output.style?.gridSeparator).toEqual({ width: 4, color: '#000000' });
    // The linkage palette moved to PuzzleDraft; MapStyle no longer carries it.
    expect(output.style && 'linkageColors' in output.style).toBe(false);
  });
});

describe('map style (v0.3.8 FEAT-D02/D03)', () => {
  it('starts from the shipped defaults and is always fully resolved', () => {
    const style = store().style;
    expect(style.cellSize).toBeNull();
    // v0.5.2 SPEC-M07: 12px frame, 32px region label.
    expect(style.canvasFrame.width).toBe(12);
    expect(style.regionLabel.fontSize).toBe(32);
  });

  it('adopts the style block of the loaded draft', () => {
    store().init(
      2,
      {
        ...draft(),
        style: {
          cellSize: 150,
          gridSeparator: { width: 4, color: '#112233' },
        },
      } as MapDraft,
      { currentVersionNo: null, status: 'draft' },
    );
    expect(store().style.cellSize).toBe(150);
    expect(store().style.gridSeparator).toEqual({ width: 4, color: '#112233' });
    // Untouched fields keep their defaults.
    expect(store().style.canvasFrame).toEqual({ width: 12, color: '#000000' });
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
    // v0.5.2 SPEC-M07: the pre-change default is 12px now.
    expect(store().style.canvasFrame.width).toBe(12);
  });

  it('v0.7.0: the map-level outline width no longer writes into regions', () => {
    store().createRegion(regionInput('rg_a', [[0, 0]]), 'override');
    store().createRegion(regionInput('rg_b', [[2, 2]]), 'override');
    store().setMapStyle((current) => ({
      ...current,
      regionOutline: { ...current.regionOutline, width: 10 },
    }));
    expect(store().style.regionOutline.width).toBe(10);
    // Both regions follow the new default — neither carries an override.
    expect(store().regions.map((region) => region.style)).toEqual([undefined, undefined]);
    // One undo step for the style itself.
    expect(store().past).toHaveLength(3);
    store().undo();
    expect(store().style.regionOutline.width).toBe(12);
  });

  it('v0.7.0: a region keeps the override it recorded across a default change', () => {
    store().createRegion(
      regionInput('rg_a', [[0, 0]], {
        outline: { width: 6, color: '#111111' },
        highlight: { width: 5, color: '#3B82F6' },
        label: {
          fontFamily: 'system',
          fontSize: 32,
          strokeWidth: 10,
          color: '#FFFFFF',
          strokeColor: '#000000',
          hoverFontSize: 36,
          hoverColor: '#FFFFFF',
          hoverStrokeColor: '#3B82F6',
          hoverStrokeWidth: 10,
        },
        labelOffset: { x: 0, y: 0 },
      }),
      'override',
    );
    // Only the outline width / colour and the highlight width differ from the
    // shipped defaults (outline 12 / #000000, highlight 12 / #3B82F6).
    expect(store().regions[0]?.style).toEqual({
      outline: { width: 6, color: '#111111' },
      highlight: { width: 5 },
    });
    store().setMapStyle((current) => ({
      ...current,
      regionOutline: { ...current.regionOutline, width: 10 },
    }));
    // The recorded override survives; only the *default* moved.
    expect(store().regions[0]?.style?.outline?.width).toBe(6);
  });

  it('v0.7.0: creating a region whose style equals the defaults stores no style key', () => {
    store().createRegion(
      regionInput('rg_a', [[0, 0]], {
        outline: { width: 12, color: '#000000' },
        highlight: { width: 12, color: '#3B82F6' },
        label: {
          fontFamily: 'system',
          fontSize: 32,
          strokeWidth: 10,
          color: '#FFFFFF',
          strokeColor: '#000000',
          hoverFontSize: 36,
          hoverColor: '#FFFFFF',
          hoverStrokeColor: '#3B82F6',
          hoverStrokeWidth: 10,
        },
        labelOffset: { x: 0, y: 0 },
      }),
      'override',
    );
    expect('style' in (store().regions[0] ?? {})).toBe(false);
  });

  it('v0.7.0: updating a region drops a style that came to match the defaults', () => {
    store().createRegion(
      regionInput('rg_a', [[0, 0]], {
        outline: { width: 6, color: '#111111' },
        highlight: { width: 12, color: '#3B82F6' },
        label: {
          fontFamily: 'system',
          fontSize: 32,
          strokeWidth: 10,
          color: '#FFFFFF',
          strokeColor: '#000000',
          hoverFontSize: 36,
          hoverColor: '#FFFFFF',
          hoverStrokeColor: '#3B82F6',
          hoverStrokeWidth: 10,
        },
        labelOffset: { x: 0, y: 0 },
      }),
      'override',
    );
    expect(store().regions[0]?.style).toEqual({ outline: { width: 6, color: '#111111' } });
    store().updateRegion('rg_a', {
      id: 'rg_a',
      name: 'Room',
      cells: [[0, 0]],
      style: {
        outline: { width: 12, color: '#000000' },
        highlight: { width: 12, color: '#3B82F6' },
        label: {
          fontFamily: 'system',
          fontSize: 32,
          strokeWidth: 10,
          color: '#FFFFFF',
          strokeColor: '#000000',
          hoverFontSize: 36,
          hoverColor: '#FFFFFF',
          hoverStrokeColor: '#3B82F6',
          hoverStrokeWidth: 10,
        },
        labelOffset: { x: 0, y: 0 },
      },
    });
    expect('style' in (store().regions[0] ?? {})).toBe(false);
  });

  it('applyDraft adopts the imported style and resets the history', () => {
    store().setMapStyle((current) => ({ ...current, border: { ...current.gridSeparator, width: 8 } }));
    store().applyDraft({ ...draft(), style: { cellSize: 200 } } as MapDraft);
    expect(store().style.cellSize).toBe(200);
    expect(store().style.gridSeparator.width).toBe(4);
    expect(store().dirty).toBe(true);
  });
});

/**
 * v0.7.5 (docs/v0.7.5.md §5): 展示变换存在**脚位锚点**上，缺省不写键。
 * 信息框可能停在脚位里的任意一格（2×2 的中间那格也是合法选中），所以
 * 动作自己解析锚点，调用方只管传当前格。
 */
describe('setItemTransform', () => {
  it('records only the fields that differ from the default', () => {
    store().placeItem({ assetId: 5, w: 1, h: 1 }, 1, 1);
    store().setItemTransform(1, 1, { scale: 1.5, offsetX: -0.5 });
    expect(store().cells.get('1,1')?.item).toEqual({
      assetId: 5,
      w: 1,
      h: 1,
      scale: 1.5,
      offsetX: -0.5,
    });
  });

  it('resolves the anchor from any cell of the footprint', () => {
    store().placeItem({ assetId: 5, w: 2, h: 2 }, 0, 0);
    store().setItemTransform(1, 1, { scale: 2 });
    expect(store().cells.get('0,0')?.item?.scale).toBe(2);
    // 其余脚位格仍然只是占位，不携带 item。
    expect(store().cells.get('1,1')?.item).toBeUndefined();
  });

  it('clamps and rounds to two decimals', () => {
    store().placeItem({ assetId: 5, w: 1, h: 1 }, 0, 0);
    store().setItemTransform(0, 0, { scale: 99, offsetX: -99, offsetY: 0.333 });
    expect(store().cells.get('0,0')?.item).toEqual({
      assetId: 5,
      w: 1,
      h: 1,
      scale: 4,
      offsetX: -4,
      offsetY: 0.33,
    });
  });

  it('drops the keys again when everything is back at the default', () => {
    store().placeItem({ assetId: 5, variantId: 7, w: 2, h: 1 }, 0, 0);
    store().setItemTransform(0, 0, { scale: 2, offsetY: 1 });
    store().setItemTransform(0, 0, { scale: 1, offsetX: 0, offsetY: 0 });
    expect(store().cells.get('0,0')?.item).toEqual({ assetId: 5, variantId: 7, w: 2, h: 1 });
  });

  it('does not push a history step when the resolved value is unchanged', () => {
    store().placeItem({ assetId: 5, w: 1, h: 1 }, 0, 0);
    const before = store().past.length;
    // 已经是 1（默认），再提交一次 1 / 夹到边界的重复值都不该进撤销栈。
    store().setItemTransform(0, 0, { scale: 1 });
    store().setItemTransform(0, 0, { offsetX: 99 });
    expect(store().past.length).toBe(before + 1); // 只有 offsetX=99 → 4 那一步
  });

  it('ignores a cell with no item', () => {
    store().setItemTransform(4, 4, { scale: 2 });
    expect(store().cells.size).toBe(0);
    expect(store().dirty).toBe(false);
  });
});

/**
 * v0.9.6：区域标签位置偏移 —— 每块区域独立配置，缺省不落盘。
 *
 * 这一层钉的是**存储契约**：偏移非 0 时跟着区域一起存下来，两轴都 0 时不写
 * `style` 键（与其它字段同一条「只记差异」的规矩）。
 */
describe('区域标签位置偏移（v0.9.6）', () => {
  const baseRegionStyle = (): RegionStyle => ({
    outline: { width: DEFAULT_MAP_STYLE.regionOutline.width, color: DEFAULT_MAP_STYLE.regionOutline.color },
    highlight: {
      width: DEFAULT_MAP_STYLE.regionHighlight.width,
      color: DEFAULT_MAP_STYLE.regionHighlight.color,
    },
    label: DEFAULT_MAP_STYLE.regionLabel,
    labelOffset: { x: 0, y: 0 },
  });

  it('存下非 0 的偏移，逐区域独立', () => {
    store().createRegion(
      regionInput('rg_a', [[0, 0]], { ...baseRegionStyle(), labelOffset: { x: 12, y: -6 } }),
      'override',
    );
    store().createRegion(regionInput('rg_b', [[2, 2]]), 'override');

    expect(store().regions[0]?.style?.label?.offset).toEqual({ x: 12, y: -6 });
    expect(store().regions[1]?.style).toBeUndefined();
  });

  it('两轴都是 0 时整个 style 键不落盘', () => {
    store().createRegion(regionInput('rg_a', [[0, 0]], baseRegionStyle()), 'override');
    expect('style' in (store().regions[0] ?? {})).toBe(false);
  });
});