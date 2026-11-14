import {
  BORDER_WIDTH,
  DEFAULT_MAP_STYLE,
  MAP_LAYER_ORDER,
  MAP_LAYER_Z,
  type DraftCell,
  type DraftRegion,
  type EditorLayer,
  type Asset,
  type MapLayerName,
  type MapStyleMouseCursorBox,
  type MapStyleOperationCursorBox,
} from '@loredoku/shared';
import { cellScale, scaleLineWidth } from '@/lib/canvasScale';
import { regionAt } from '@/lib/region';

export type CellMap = Map<string, DraftCell>;

/**
 * OPT-901 §1.1: the spec numbers the layers top-most first. `MAP_LAYER_ORDER`
 * is that list and `MAP_LAYER_Z` maps each name to its CSS `z-index`, so
 * "later in the list" ⇔ "smaller z-index". Exposed through this helper so
 * both the renderer and the unit tests read the same source of truth.
 */
export function layerZ(name: MapLayerName): number {
  return MAP_LAYER_Z[name];
}

/** Convenience for tests: the z-index pairs in top-most-first order. */
export function layerStack(): Array<{ name: MapLayerName; z: number }> {
  return MAP_LAYER_ORDER.map((name) => ({ name, z: MAP_LAYER_Z[name] }));
}

/** Base inset of the non-standable mask before the OPT-B03 scale is applied. */
export const BLOCKING_SHADOW_INSET = BORDER_WIDTH / 2;

/** OPT-B03: the mask inset follows the scaled Border width. */
export function blockingShadowInset(cellSize: number): number {
  return scaleLineWidth(BORDER_WIDTH, cellScale(cellSize)) / 2;
}

/** Splits a `"x,y"` cell key back into numbers. */
function parseKey(key: string): [number, number] {
  return key.split(',').map(Number) as [number, number];
}

/**
 * Every cell covered by an object, anchor cells included. A multi-cell
 * object occupies `w × h` cells even though only the anchor is stored.
 */
export function collectItemCells(cells: CellMap): Set<string> {
  const covered = new Set<string>();
  for (const [key, cell] of cells.entries()) {
    const anchor = cell.item;
    if (!anchor) continue;
    const [x, y] = parseKey(key);
    for (let dy = 0; dy < anchor.h; dy += 1) {
      for (let dx = 0; dx < anchor.w; dx += 1) {
        covered.add(`${x + dx},${y + dy}`);
      }
    }
  }
  return covered;
}

/**
 * OPT-901 §1.2.5: cells whose **物品层** item has `blocking === true` get a
 * super-low-opacity grey mask. An item that is missing from `assetsById`
 * (inactive or deleted) is treated as non-blocking so stale drafts don't grow
 * a shadow.
 *
 * Because §4.1 keeps the mask purely presentational, changing `blocking` in
 * the asset manager takes effect on the next render — nothing is removed from
 * the board.
 */
export function collectBlockingCells(
  cells: CellMap,
  assetsById: Map<number, Asset>,
): Set<string> {
  const result = new Set<string>();
  for (const [key, cell] of cells.entries()) {
    const anchor = cell.item;
    if (!anchor) continue;
    if (assetsById.get(anchor.assetId)?.blocking !== true) continue;
    const [x, y] = parseKey(key);
    for (let dy = 0; dy < anchor.h; dy += 1) {
      for (let dx = 0; dx < anchor.w; dx += 1) {
        result.add(`${x + dx},${y + dy}`);
      }
    }
  }
  return result;
}

export interface HoverEffects {
  /** The cell under the cursor, or `null` when outside the board. */
  cell: { x: number; y: number } | null;
  /** OPT-902 §2.1: `true` → the cursor box uses the medium red stroke. */
  blocked: boolean;
  /** OPT-902 §2.2: id of the region covering the hovered cell. */
  regionId: string | null;
  /** OPT-902 §2.3: an object image sits under the cursor and should lift. */
  hasItem: boolean;
}

export const NO_HOVER_EFFECTS: HoverEffects = {
  cell: null,
  blocked: false,
  regionId: null,
  hasItem: false,
};

/**
 * OPT-902 §2.4: the cursor box, the region emphasis and the item lift are
 * resolved independently so all three can fire for the same cell.
 */
export function resolveHoverEffects(input: {
  hover: { x: number; y: number } | null;
  blockingCells: Set<string>;
  itemCells: Set<string>;
  regions: DraftRegion[];
}): HoverEffects {
  const { hover, blockingCells, itemCells, regions } = input;
  if (!hover) return NO_HOVER_EFFECTS;
  const key = `${hover.x},${hover.y}`;
  return {
    cell: { x: hover.x, y: hover.y },
    blocked: blockingCells.has(key),
    regionId: regionAt(regions, hover.x, hover.y)?.id ?? null,
    hasItem: itemCells.has(key),
  };
}

/**
 * v0.3.8 FEAT-D02: the mouse box geometry is now driven by the map style
 * (`style.mouseCursorBox` + `style.border`) instead of module constants, so the
 * 「地图基本信息」drawer can retune it per map.
 *
 * §4.1/§3.3.1 (mouse box) — an Inner Line in the state colour (white for a
 * free cell, the blocked colour for a non-standable one) plus a grey ring
 * covering the Border. Returned as one `box-shadow` so the shape never moves.
 *
 * OPT-B03 §3.2: both widths are multiplied by `cellSize / BASE_CELL`, so the
 * default `cellSize` reproduces the v0.3.5 look exactly.
 */
export function cellCursorShadow(
  blocked: boolean,
  cellSize: number,
  cursor: MapStyleMouseCursorBox = DEFAULT_MAP_STYLE.mouseCursorBox,
  borderWidth: number = DEFAULT_MAP_STYLE.gridSeparator.width,
): string {
  const scale = cellScale(cellSize);
  const stroke = blocked ? cursor.blockedColor : cursor.color;
  const inner = scaleLineWidth(cursor.width, scale);
  const gap = scaleLineWidth(borderWidth, scale);
  return `inset 0 0 0 ${inner}px ${stroke}, 0 0 0 ${gap}px ${cursor.shadowColor}`;
}

/**
 * OPT-A05 §4.1/§4.3 (operation box) — a pale blue Outline pinned to the
 * clicked cell. §3.2.2 defines the Outline as sitting **outside** the Border
 * and not participating in layout, which is why it is a CSS `outline` with an
 * offset rather than another inset ring: with both boxes on the same cell the
 * white mouse line ends up inside and the blue outline outside.
 */
export function operationCursorOutline(
  cellSize: number,
  cursor: MapStyleOperationCursorBox = DEFAULT_MAP_STYLE.operationCursorBox,
): string {
  const width = scaleLineWidth(cursor.width, cellScale(cellSize));
  return `${width}px solid ${cursor.color}`;
}

export function operationCursorStyle(
  cellSize: number,
  cursor: MapStyleOperationCursorBox = DEFAULT_MAP_STYLE.operationCursorBox,
): {
  outline: string;
  outlineOffset: string;
} {
  // v0.10.7：`offset` 是格的百分比（100 = 一格），乘 `cellSize` 换成像素 ——
  // 以前它直接就是像素，同一份 `1` 在小格子上几乎贴着线、在大格子上被摊薄。
  const offset = (cursor.offset / 100) * cellSize;
  return {
    outline: operationCursorOutline(cellSize, cursor),
    outlineOffset: `${offset}px`,
  };
}

/**
 * OPT-A05 §4.1/§4.3: the two cursor boxes are independent elements that can
 * coexist. The mouse box tracks the pointer; the operation box is pinned to
 * the clicked cell (the cell the info drawer points at). Resolving both from
 * one place keeps the stacking rule — mouse box on top, blue outline outside
 * — expressed exactly once.
 */
export interface CursorBoxes {
  /** §4.1 鼠标提示框 — follows the pointer, `null` when off the board. */
  mouse: { x: number; y: number; blocked: boolean } | null;
  /** §4.1 操作提示框 — pinned to the clicked cell, `null` when nothing is selected. */
  operation: { x: number; y: number } | null;
  /** §4.3: both boxes land on the same cell → white line inside, blue outside. */
  stacked: boolean;
}

export const NO_CURSOR_BOXES: CursorBoxes = { mouse: null, operation: null, stacked: false };

export function resolveCursorBoxes(input: {
  hover: { x: number; y: number } | null;
  blocked: boolean;
  selection: { x: number; y: number } | null;
}): CursorBoxes {
  const { hover, blocked, selection } = input;
  const mouse = hover ? { x: hover.x, y: hover.y, blocked } : null;
  const operation = selection ? { x: selection.x, y: selection.y } : null;
  return {
    mouse,
    operation,
    stacked: mouse !== null && operation !== null && mouse.x === operation.x && mouse.y === operation.y,
  };
}

/**
 * OPT-904 §4.1: the background layer only accepts `type === 'background'`
 * assets and the item layer only accepts `type === 'item'` assets, so a
 * blocking item is still placeable on the item layer while never being
 * placeable on the background layer.
 */
export function canPlaceAssetOnLayer(asset: Asset | null, layer: EditorLayer): boolean {
  if (!asset) return false;
  return asset.type === layer;
}
