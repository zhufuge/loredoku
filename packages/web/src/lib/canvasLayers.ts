import {
  CELL_CURSOR_BLOCKED_COLOR,
  CELL_CURSOR_COLOR,
  CELL_CURSOR_SHADOW_COLOR,
  GRID_LINE_WIDTH,
  MAP_LAYER_ORDER,
  MAP_LAYER_Z,
  type DraftCell,
  type DraftRegion,
  type EditorLayer,
  type Item,
  type MapLayerName,
} from '@murdoku/shared';
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

/** The shadow ring inset of the non-standable mask (Border inner edge). */
export const NO_STAND_SHADOW_INSET = GRID_LINE_WIDTH / 2;

/** Splits a `"x,y"` cell key back into numbers. */
function parseKey(key: string): [number, number] {
  return key.split(',').map(Number) as [number, number];
}

/**
 * Every cell covered by an object, anchor cells included. A multi-cell
 * object occupies `w × h` cells even though only the anchor is stored.
 */
export function collectObjectCells(cells: CellMap): Set<string> {
  const covered = new Set<string>();
  for (const [key, cell] of cells.entries()) {
    const anchor = cell.object;
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
 * OPT-901 §1.2.5: cells whose **物件层** item has `canStand === false` get a
 * super-low-opacity grey mask. An item that is missing from `itemsById`
 * (inactive or deleted) is treated as standable so stale drafts don't grow
 * a shadow.
 *
 * Because §4.1 keeps the mask purely presentational, changing `can_stand` in
 * the item manager takes effect on the next render — nothing is removed from
 * the board.
 */
export function collectNoStandCells(
  cells: CellMap,
  itemsById: Map<number, Item>,
): Set<string> {
  const result = new Set<string>();
  for (const [key, cell] of cells.entries()) {
    const anchor = cell.object;
    if (!anchor) continue;
    if (itemsById.get(anchor.itemId)?.canStand !== false) continue;
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
  hasObject: boolean;
}

export const NO_HOVER_EFFECTS: HoverEffects = {
  cell: null,
  blocked: false,
  regionId: null,
  hasObject: false,
};

/**
 * OPT-902 §2.4: the cursor box, the region emphasis and the item lift are
 * resolved independently so all three can fire for the same cell.
 */
export function resolveHoverEffects(input: {
  hover: { x: number; y: number } | null;
  noStandCells: Set<string>;
  objectCells: Set<string>;
  regions: DraftRegion[];
}): HoverEffects {
  const { hover, noStandCells, objectCells, regions } = input;
  if (!hover) return NO_HOVER_EFFECTS;
  const key = `${hover.x},${hover.y}`;
  return {
    cell: { x: hover.x, y: hover.y },
    blocked: noStandCells.has(key),
    regionId: regionAt(regions, hover.x, hover.y)?.id ?? null,
    hasObject: objectCells.has(key),
  };
}

/**
 * OPT-901 §1.2.1: 1px inner stroke in the state colour, plus a grey ring that
 * sits on top of the Border. Returned as a single `box-shadow` so the shape
 * never moves.
 */
export function cellCursorShadow(blocked: boolean): string {
  const stroke = blocked ? CELL_CURSOR_BLOCKED_COLOR : CELL_CURSOR_COLOR;
  return `inset 0 0 0 1px ${stroke}, 0 0 0 ${GRID_LINE_WIDTH}px ${CELL_CURSOR_SHADOW_COLOR}`;
}

/**
 * OPT-904 §4.1: the background layer only accepts `category === 'background'`
 * items and the object layer only accepts `category === 'object'` items, so a
 * non-standable object is still placeable on the object layer while never
 * being placeable on the background layer.
 */
export function canPlaceItemOnLayer(item: Item | null, layer: EditorLayer): boolean {
  if (!item) return false;
  return item.category === layer;
}
