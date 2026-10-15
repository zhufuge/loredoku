import { describe, expect, it } from 'vitest';
import {
  BORDER_WIDTH,
  CELL_CURSOR_BLOCKED_COLOR,
  CELL_CURSOR_COLOR,
  CELL_CURSOR_SHADOW_COLOR,
  EFFECT_COLOR_HEX,
  HIGHLIGHT_BLUE,
  HIGHLIGHT_RED,
  INNER_LINE_WIDTH,
  LINE_COLOR,
  MAP_LAYER_ORDER,
  MAP_LAYER_Z,
  NO_STAND_SHADOW_COLOR,
  NO_STAND_SHADOW_Z,
  OPERATION_CURSOR_COLOR,
  OPERATION_CURSOR_OUTLINE_OFFSET,
  OPERATION_CURSOR_OUTLINE_WIDTH,
  OUTLINE_WIDTH,
  REGION_BORDER_WIDTH,
  REGION_BORDER_WIDTH_MAX,
  REGION_BORDER_WIDTH_MIN,
  REGION_HIGHLIGHT_BORDER_COLOR,
  type DraftCell,
  type DraftRegion,
  type Item,
} from '@murdoku/shared';
import {
  canPlaceItemOnLayer,
  cellCursorShadow,
  collectNoStandCells,
  collectObjectCells,
  layerStack,
  layerZ,
  NO_CURSOR_BOXES,
  NO_HOVER_EFFECTS,
  NO_STAND_SHADOW_INSET,
  operationCursorOutline,
  resolveCursorBoxes,
  resolveHoverEffects,
  type CellMap,
} from './canvasLayers';

function cells(entries: Array<[string, DraftCell]>): CellMap {
  return new Map(entries);
}

function item(overrides: Partial<Item> = {}): Item {
  return {
    id: 1,
    code: 'item_1',
    name: 'Item',
    category: 'object',
    widthCells: 1,
    heightCells: 1,
    canStand: true,
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
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const region: DraftRegion = {
  id: 'rg_a',
  name: 'A 区',
  color: '#000000',
  borderWidth: 6,
  fillOpacity: 0,
  cells: [
    [1, 1],
    [2, 1],
  ],
};

// ---- OPT-901 §1.1: layer priority ----
describe('canvas layer priority (OPT-901 §1.1)', () => {
  it('lists the eleven layers top-most first, exactly as the spec numbers them', () => {
    expect(MAP_LAYER_ORDER).toEqual([
      'cellCursor',
      'regionLabel',
      'object',
      'gridBorder',
      'regionEdge',
      'noStandShadow',
      'regionHighlight',
      'cellHighlight',
      'backgroundHighlight',
      'background',
      'emptyCell',
    ]);
  });

  it('assigns a strictly descending z-index along that order', () => {
    const stack = layerStack();
    for (let index = 1; index < stack.length; index += 1) {
      expect(stack[index - 1]!.z).toBeGreaterThan(stack[index]!.z);
    }
  });

  it('keeps the ordering rules the spec calls out explicitly', () => {
    // "「物体」位于 Border 之上" — items are never cut by the grid lines.
    expect(layerZ('object')).toBeGreaterThan(layerZ('gridBorder'));
    // "「区域边界线」位于 Border 之下" — the Border stays readable.
    expect(layerZ('regionEdge')).toBeLessThan(layerZ('gridBorder'));
    // 不可站立阴影 / 区域高亮线 / 方块高亮 / 背景高亮 / 背景
    expect(layerZ('noStandShadow')).toBeGreaterThan(layerZ('regionHighlight'));
    expect(layerZ('regionHighlight')).toBeGreaterThan(layerZ('cellHighlight'));
    expect(layerZ('cellHighlight')).toBeGreaterThan(layerZ('backgroundHighlight'));
    expect(layerZ('backgroundHighlight')).toBeGreaterThan(layerZ('background'));
    // The cursor box is the top-most element (§1.2.1).
    expect(layerZ('cellCursor')).toBe(Math.max(...Object.values(MAP_LAYER_Z)));
    expect(layerZ('regionLabel')).toBeLessThan(layerZ('cellCursor'));
    expect(layerZ('regionLabel')).toBeGreaterThan(layerZ('object'));
  });
});

// ---- OPT-901 §1.2.5: non-standable shadow ----
describe('non-standable shadow (OPT-901 §1.2.5)', () => {
  it('masks the cell of a non-standable object', () => {
    const map = cells([['2,3', { object: { itemId: 7, w: 1, h: 1 } }]]);
    const items = new Map([[7, item({ id: 7, canStand: false })]]);
    expect(collectNoStandCells(map, items)).toEqual(new Set(['2,3']));
  });

  it('masks every cell of a multi-cell footprint', () => {
    const map = cells([['1,1', { object: { itemId: 7, w: 2, h: 2 } }]]);
    const items = new Map([[7, item({ id: 7, canStand: false })]]);
    expect([...collectNoStandCells(map, items)].sort()).toEqual(['1,1', '1,2', '2,1', '2,2']);
  });

  it('renders nothing for standable objects or background-only cells', () => {
    const map = cells([
      ['0,0', { object: { itemId: 7, w: 1, h: 1 } }],
      ['1,0', { background: { itemId: 8 } }],
    ]);
    const items = new Map([
      [7, item({ id: 7, canStand: true })],
      [8, item({ id: 8, category: 'background', canStand: false })],
    ]);
    expect(collectNoStandCells(map, items).size).toBe(0);
  });

  it('treats an unknown (inactive / deleted) item as standable', () => {
    const map = cells([['0,0', { object: { itemId: 404, w: 1, h: 1 } }]]);
    expect(collectNoStandCells(map, new Map()).size).toBe(0);
  });

  it('updates as soon as `canStand` flips, without touching the board', () => {
    const map = cells([['0,0', { object: { itemId: 7, w: 1, h: 1 } }]]);
    const standable = new Map([[7, item({ id: 7, canStand: true })]]);
    const blocked = new Map([[7, item({ id: 7, canStand: false })]]);
    expect(collectNoStandCells(map, standable).size).toBe(0);
    expect(collectNoStandCells(map, blocked).size).toBe(1);
    // The board itself is untouched either way.
    expect(map.get('0,0')?.object).toEqual({ itemId: 7, w: 1, h: 1 });
  });

  it('§3.1/§7.3: renders above the object artwork but below the labels', () => {
    // §1.1 puts 物体 above 边框, so "above the artwork, inside the Border"
    // means one slot above `object` while the mask stays inset by 1px.
    expect(NO_STAND_SHADOW_Z).toBeGreaterThan(MAP_LAYER_Z.object);
    expect(NO_STAND_SHADOW_Z).toBeLessThan(MAP_LAYER_Z.regionLabel);
    expect(NO_STAND_SHADOW_Z).toBeLessThan(MAP_LAYER_Z.cellCursor);
    expect(NO_STAND_SHADOW_INSET).toBeGreaterThan(0);
  });

  it('collects every covered object cell (not just the anchor)', () => {
    const map = cells([['0,0', { object: { itemId: 7, w: 2, h: 1 } }]]);
    expect([...collectObjectCells(map)].sort()).toEqual(['0,0', '1,0']);
  });
});

// ---- OPT-902 §2.1~2.4: the three hover effects ----
describe('hover effects (OPT-902 §2.1~2.4)', () => {
  const hoverCells = cells([
    ['1,1', { object: { itemId: 7, w: 1, h: 1 } }],
    ['3,3', { object: { itemId: 9, w: 1, h: 1 } }],
  ]);
  const items = new Map([
    [7, item({ id: 7, canStand: true })],
    [9, item({ id: 9, canStand: false })],
  ]);
  const objectCells = collectObjectCells(hoverCells);
  const noStandCells = collectNoStandCells(hoverCells, items);

  it('returns nothing when the pointer is off the board', () => {
    expect(
      resolveHoverEffects({ hover: null, noStandCells, objectCells, regions: [region] }),
    ).toEqual(NO_HOVER_EFFECTS);
  });

  it('§2.1: a free cell gets the white cursor box', () => {
    const effects = resolveHoverEffects({
      hover: { x: 0, y: 0 },
      noStandCells,
      objectCells,
      regions: [region],
    });
    expect(effects).toEqual({ cell: { x: 0, y: 0 }, blocked: false, regionId: null, hasObject: false });
  });

  it('§2.1: a cell holding a non-standable object gets the red cursor box', () => {
    const effects = resolveHoverEffects({
      hover: { x: 3, y: 3 },
      noStandCells,
      objectCells,
      regions: [region],
    });
    expect(effects.blocked).toBe(true);
    expect(effects.hasObject).toBe(true);
  });

  it('§2.2: hovering any covered cell of a region reports that region', () => {
    for (const hover of [{ x: 1, y: 1 }, { x: 2, y: 1 }]) {
      expect(
        resolveHoverEffects({ hover, noStandCells, objectCells, regions: [region] }).regionId,
      ).toBe('rg_a');
    }
    // §2.2 边界情形: stepping out of the region clears the emphasis.
    expect(
      resolveHoverEffects({
        hover: { x: 5, y: 5 },
        noStandCells,
        objectCells,
        regions: [region],
      }).regionId,
    ).toBeNull();
  });

  it('§2.2 边界情形: moving straight from region A to region B switches emphasis', () => {
    const other: DraftRegion = { ...region, id: 'rg_b', name: 'B 区', cells: [[3, 1]] };
    const first = resolveHoverEffects({
      hover: { x: 1, y: 1 },
      noStandCells,
      objectCells,
      regions: [region, other],
    });
    const second = resolveHoverEffects({
      hover: { x: 3, y: 1 },
      noStandCells,
      objectCells,
      regions: [region, other],
    });
    expect(first.regionId).toBe('rg_a');
    expect(second.regionId).toBe('rg_b');
  });

  it('§2.4: cursor box, region emphasis and item lift stack on one hover', () => {
    const effects = resolveHoverEffects({
      hover: { x: 1, y: 1 },
      noStandCells,
      objectCells,
      regions: [region],
    });
    expect(effects.cell).toEqual({ x: 1, y: 1 });
    expect(effects.regionId).toBe('rg_a');
    expect(effects.hasObject).toBe(true);
    expect(effects.blocked).toBe(false);
  });
});

describe('cell cursor box (OPT-A05 §3.3.1)', () => {
  it('uses a 1px inner stroke in the state colour plus the grey Border shadow', () => {
    expect(cellCursorShadow(false)).toContain(
      `inset 0 0 0 ${INNER_LINE_WIDTH}px ${CELL_CURSOR_COLOR}`,
    );
    expect(cellCursorShadow(true)).toContain(
      `inset 0 0 0 ${INNER_LINE_WIDTH}px ${CELL_CURSOR_BLOCKED_COLOR}`,
    );
    for (const blocked of [false, true]) {
      expect(cellCursorShadow(blocked)).toContain(CELL_CURSOR_SHADOW_COLOR);
    }
  });
});

// ---- OPT-A05 §4: mouse box vs operation box ----
describe('cursor boxes (OPT-A05 §4.1~§4.3)', () => {
  it('shows the mouse box alone while nothing is selected', () => {
    expect(resolveCursorBoxes({ hover: { x: 2, y: 3 }, blocked: false, selection: null })).toEqual({
      mouse: { x: 2, y: 3, blocked: false },
      operation: null,
      stacked: false,
    });
  });

  it('keeps the operation box pinned after the pointer leaves', () => {
    expect(resolveCursorBoxes({ hover: null, blocked: false, selection: { x: 1, y: 1 } })).toEqual({
      mouse: null,
      operation: { x: 1, y: 1 },
      stacked: false,
    });
  });

  it('shows both boxes on different cells', () => {
    const boxes = resolveCursorBoxes({
      hover: { x: 2, y: 3 },
      blocked: false,
      selection: { x: 1, y: 1 },
    });
    expect(boxes.mouse).toEqual({ x: 2, y: 3, blocked: false });
    expect(boxes.operation).toEqual({ x: 1, y: 1 });
    expect(boxes.stacked).toBe(false);
  });

  it('§4.3: stacks them when the pointer sits on the selected cell', () => {
    const boxes = resolveCursorBoxes({
      hover: { x: 1, y: 1 },
      blocked: false,
      selection: { x: 1, y: 1 },
    });
    expect(boxes.mouse).toEqual({ x: 1, y: 1, blocked: false });
    expect(boxes.operation).toEqual({ x: 1, y: 1 });
    expect(boxes.stacked).toBe(true);
  });

  it('§4.4: only the mouse box carries the blocked state', () => {
    const boxes = resolveCursorBoxes({
      hover: { x: 4, y: 4 },
      blocked: true,
      selection: { x: 4, y: 4 },
    });
    expect(boxes.mouse?.blocked).toBe(true);
    // The operation box is always the pale blue outline.
    expect(boxes.operation).not.toHaveProperty('blocked');
  });

  it('returns nothing when neither box applies', () => {
    expect(resolveCursorBoxes({ hover: null, blocked: false, selection: null })).toEqual(
      NO_CURSOR_BOXES,
    );
  });

  it('§3.2.2: the operation box is an Outline outside the Border', () => {
    expect(operationCursorOutline()).toBe(
      `${OPERATION_CURSOR_OUTLINE_WIDTH}px solid ${OPERATION_CURSOR_COLOR}`,
    );
    expect(OPERATION_CURSOR_OUTLINE_WIDTH).toBe(2);
    expect(OPERATION_CURSOR_OUTLINE_OFFSET).toBeGreaterThanOrEqual(0);
  });
});

// ---- OPT-A04 §3.2: line definitions ----
describe('line constants (OPT-A04 §3.2)', () => {
  it('names the four cell elements as the spec does', () => {
    expect(BORDER_WIDTH).toBe(2);
    expect(OUTLINE_WIDTH).toBe(3);
    expect(INNER_LINE_WIDTH).toBe(1);
    expect(REGION_BORDER_WIDTH).toBe(6);
    expect(LINE_COLOR).toBe('#000000');
  });

  it('keeps the region outline wider than the grid Border', () => {
    expect(REGION_BORDER_WIDTH).toBeGreaterThan(BORDER_WIDTH);
    expect(REGION_BORDER_WIDTH_MIN).toBeGreaterThan(BORDER_WIDTH);
    expect(REGION_BORDER_WIDTH_MIN).toBe(4);
    expect(REGION_BORDER_WIDTH_MAX).toBe(12);
  });
});

// ---- OPT-A06 §5.1/§5.2 + OPT-A03 §3.1: colours ----
describe('highlight palette (OPT-A06)', () => {
  it('§5.1: softens the red and blue', () => {
    expect(HIGHLIGHT_RED).toBe('#EF9A9A');
    expect(HIGHLIGHT_BLUE).toBe('#90CAF9');
  });

  it('drives every highlight surface from the shared constants', () => {
    // 方块高亮 / 背景高亮 (角色联动)
    expect(EFFECT_COLOR_HEX.red).toBe(HIGHLIGHT_RED);
    expect(EFFECT_COLOR_HEX.blue).toBe(HIGHLIGHT_BLUE);
    // 区域高亮线
    expect(REGION_HIGHLIGHT_BORDER_COLOR).toBe(HIGHLIGHT_BLUE);
    // 鼠标提示框（不可站立物品时）的红色
    expect(CELL_CURSOR_BLOCKED_COLOR).toBe(HIGHLIGHT_RED);
    // 操作提示框的蓝色
    expect(OPERATION_CURSOR_COLOR).toBe(HIGHLIGHT_BLUE);
    // 鼠标提示框的空格色仍是白色
    expect(CELL_CURSOR_COLOR).toBe('#FFFFFF');
  });

  it('§5.1 不调整: the grid lines stay black and outside the palette', () => {
    expect(LINE_COLOR).toBe('#000000');
    expect(Object.values(EFFECT_COLOR_HEX)).not.toContain(LINE_COLOR);
  });

  it('§3.1/§5.2: deepens the non-standable mask to 0.18', () => {
    expect(NO_STAND_SHADOW_COLOR).toBe('rgba(0,0,0,0.18)');
  });
});

// ---- OPT-904 §4.1: layer / category matching ----
describe('placement validation (OPT-904 §4.1)', () => {
  it('allows a non-standable object on the object layer', () => {
    expect(canPlaceItemOnLayer(item({ canStand: false }), 'object')).toBe(true);
  });

  it('never allows a background item on the object layer (or vice versa)', () => {
    const background = item({ category: 'background', canStand: true });
    expect(canPlaceItemOnLayer(background, 'background')).toBe(true);
    expect(canPlaceItemOnLayer(background, 'object')).toBe(false);
    expect(canPlaceItemOnLayer(item({ category: 'object' }), 'background')).toBe(false);
  });

  it('rejects an unarmed palette', () => {
    expect(canPlaceItemOnLayer(null, 'object')).toBe(false);
  });
});
