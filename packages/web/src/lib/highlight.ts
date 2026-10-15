import {
  type CharacterSlotEntry,
  type DraftCell,
  type DraftRegion,
  type MapStyle,
  type ParticipantTarget,
} from '@murdoku/shared';
import { linkageColorFor, resolveMapStyle } from '@/lib/mapStyle';

export type CellMap = Map<string, DraftCell>;

/** MOD-802 §1.2.4: deactivation fades the highlight out over 150ms. */
export const HIGHLIGHT_FADEOUT_MS = 150;

export interface HighlightRect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Resolved `#RRGGBB` colour of the effect. */
  color: string;
}

/**
 * CLAR-603 + MOD-802 (docs/v0.3.3.md): characters are no longer placed on
 * the map; highlight requests resolve roster slots. The renderer doesn't
 * draw a map character layer, so the remaining highlight branches are
 * objects, cells, backgrounds and regions.
 *
 * MOD-802: highlights are persistent — they live until the activation ends
 * (pointer-leave for hover, toggle for click, Esc). No durations.
 */
export interface HighlightCharacter {
  /** Slot index of the participant to outline in the roster panel. */
  slotIndex: number;
  color: string;
}

/** Fully resolved highlight request: everything the renderer needs. */
export interface HighlightState {
  characters: HighlightCharacter[];
  /**
   * OPT-903 §1.2.7 方块高亮: an opaque block that lights up the **whole
   * cell** (background layer included). Used by `cell` linkages and by
   * linkages on **物件层** items — the v0.3.3 translucent item overlay is
   * gone. A multi-cell item emits one rect per covered cell (§7.3).
   */
  cellHighlights: HighlightRect[];
  /**
   * OPT-903 §1.2.8 背景高亮: only emitted for placements on the
   * **background layer**; it replaces the background layer colour block and
   * leaves the object layer visible.
   */
  backgroundHighlights: HighlightRect[];
  /**
   * MOD-802: region highlights are always an inner blue border
   * (`REGION_HIGHLIGHT_BORDER_COLOR`), regardless of how the linkage
   * was activated.
   */
  regionBorders: Array<{ regionId: string; color: string }>;
}

export interface HighlightContext {
  gridSize: number;
  cells: CellMap;
  characterSlots: Array<CharacterSlotEntry | null>;
  regions: DraftRegion[];
  /**
   * FEAT-D04: linkage colours are palette keys, so the resolved hex depends on
   * the map's own palette. Missing → the shipped red / blue defaults.
   */
  style?: MapStyle;
}

export const EMPTY_HIGHLIGHT: HighlightState = {
  characters: [],
  cellHighlights: [],
  backgroundHighlights: [],
  regionBorders: [],
};

export function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

/** FEAT-D04: resolves a palette key to a `#RRGGBB` through the map style. */
export function effectColorHex(style: MapStyle, key: string): string {
  return linkageColorFor(style, key);
}

/** Stable identity of a target so duplicates can be collapsed. */
export function targetIdentity(target: ParticipantTarget): string {
  switch (target.type) {
    case 'character':
      return `character:${target.id}`;
    case 'item':
      return `item:${target.id}`;
    case 'cell':
      return `cell:${target.cells.map((c) => c.join(',')).join('|')}`;
    case 'region':
      return `region:${target.id}`;
  }
}

export interface TargetSummary {
  identity: string;
  target: ParticipantTarget;
}

/**
 * MOD-801: the flat `linkages` list, de-duplicated by target identity
 * (later wins). The colour is kept per entry, so the same object can be
 * highlighted in two colours by two linkages.
 */
export function collectLinkages(
  linkages: ParticipantTarget[] | undefined,
): TargetSummary[] {
  const byIdentity = new Map<string, ParticipantTarget>();
  for (const target of linkages ?? []) {
    byIdentity.set(targetIdentity(target), target);
  }
  return [...byIdentity.entries()].map(([identity, target]) => ({ identity, target }));
}

/** OPT-903: which map layer a placement lives on decides the highlight. */
export type ItemPlacementLayer = 'object' | 'background';

export interface ItemPlacement {
  layer: ItemPlacementLayer;
  /** Top-left cell of the placement (anchor for multi-cell objects). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Anchor coord — what a `scope: 'instances'` linkage stores. */
  anchorX: number;
  anchorY: number;
}

/**
 * OPT-903 §3: an item linkage can point at an object-layer placement (→ 方块
 * 高亮) or a background-layer placement (→ 背景高亮), so both layers are
 * scanned. `scope: 'instances'` is matched against the anchor coord.
 */
export function findItemPlacements(cells: CellMap, itemId: number): ItemPlacement[] {
  const result: ItemPlacement[] = [];
  for (const [key, cell] of cells.entries()) {
    const [x, y] = key.split(',').map(Number) as [number, number];
    if (cell.object?.itemId === itemId) {
      result.push({
        layer: 'object',
        x,
        y,
        w: cell.object.w,
        h: cell.object.h,
        anchorX: x,
        anchorY: y,
      });
    }
    if (cell.background?.itemId === itemId) {
      result.push({ layer: 'background', x, y, w: 1, h: 1, anchorX: x, anchorY: y });
    }
  }
  return result;
}

/** All anchor cells of a given `itemId` on the **物件层** (MOD-708). */
export function findAllItemAnchors(
  cells: CellMap,
  itemId: number,
): Array<HighlightRect> {
  return findItemPlacements(cells, itemId)
    .filter((placement) => placement.layer === 'object')
    .map((placement) => ({
      x: placement.x,
      y: placement.y,
      w: placement.w,
      h: placement.h,
      color: '',
    }));
}

/**
 * Turns one participant's flat linkage list into concrete rectangles.
 *
 * MOD-708: `cell` targets have `cells` array; `item` targets have `scope`.
 * MOD-802: `region` targets always produce an inner blue border.
 * OPT-903: item targets produce 方块高亮 (物件层) or 背景高亮 (背景层) —
 * never a translucent overlay.
 */
export function resolveHighlight(
  linkages: ParticipantTarget[] | undefined,
  ctx: HighlightContext,
): HighlightState | null {
  const targets = collectLinkages(linkages);
  if (targets.length === 0) return null;

  const style = resolveMapStyle(ctx.style);
  const characters = new Map<string, HighlightCharacter>();
  const cellHighlights = new Map<string, HighlightRect>();
  const backgroundHighlights = new Map<string, HighlightRect>();
  const regionBorders: Array<{ regionId: string; color: string }> = [];

  for (const { target } of targets) {
    const color = effectColorHex(style, target.color);

    if (target.type === 'character') {
      const slotIndex = ctx.characterSlots.findIndex(
        (slot) => slot?.characterId === target.id,
      );
      if (slotIndex === -1) continue;
      characters.set(`character:${target.id}`, { slotIndex, color });
      continue;
    }

    if (target.type === 'item') {
      const placements = findItemPlacements(ctx.cells, target.id);
      if (placements.length === 0) continue;
      const wanted =
        target.scope === 'instances' && target.instances
          ? new Set(target.instances.map(([x, y]) => `${x},${y}`))
          : null;
      for (const placement of placements) {
        if (wanted && !wanted.has(`${placement.anchorX},${placement.anchorY}`)) continue;
        if (placement.layer === 'background') {
          // OPT-903 §1.2.8: 背景高亮 replaces only the background layer.
          backgroundHighlights.set(`bg:${placement.x},${placement.y}`, {
            x: placement.x,
            y: placement.y,
            w: 1,
            h: 1,
            color,
          });
          continue;
        }
        // OPT-903 §1.2.7 + §7.3: 方块高亮 covers every occupied cell.
        for (let dy = 0; dy < placement.h; dy += 1) {
          for (let dx = 0; dx < placement.w; dx += 1) {
            const cx = placement.x + dx;
            const cy = placement.y + dy;
            if (cx < 0 || cy < 0 || cx >= ctx.gridSize || cy >= ctx.gridSize) continue;
            cellHighlights.set(`cell:${cx},${cy}`, { x: cx, y: cy, w: 1, h: 1, color });
          }
        }
      }
      continue;
    }

    if (target.type === 'cell') {
      for (const [cx, cy] of target.cells) {
        if (cx < 0 || cy < 0 || cx >= ctx.gridSize || cy >= ctx.gridSize) continue;
        cellHighlights.set(`cell:${cx},${cy}`, { x: cx, y: cy, w: 1, h: 1, color });
      }
      continue;
    }

    // region target — the highlight line uses the map's region-highlight colour.
    const region = ctx.regions.find((item) => item.id === target.id);
    if (!region) continue;
    regionBorders.push({ regionId: region.id, color: style.regionHighlight.color });
  }

  if (
    characters.size === 0 &&
    cellHighlights.size === 0 &&
    backgroundHighlights.size === 0 &&
    regionBorders.length === 0
  ) {
    return null;
  }
  return {
    characters: [...characters.values()],
    cellHighlights: [...cellHighlights.values()],
    backgroundHighlights: [...backgroundHighlights.values()],
    regionBorders,
  };
}
