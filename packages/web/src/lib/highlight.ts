import {
  EFFECT_COLOR_HEX,
  REGION_HIGHLIGHT_BORDER_COLOR,
  type CharacterSlotEntry,
  type DraftCell,
  type DraftRegion,
  type EffectColor,
  type ParticipantTarget,
} from '@murdoku/shared';

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
 * draw a map character layer, so the only remaining highlight branches are
 * objects, cells and regions.
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
  objects: HighlightRect[];
  cells: HighlightRect[];
  /**
   * MOD-802: region highlights are always an inner blue border
   * (`#3B82F6`), regardless of how the linkage was activated.
   */
  regionBorders: Array<{ regionId: string; color: string }>;
}

export interface HighlightContext {
  gridSize: number;
  cells: CellMap;
  characterSlots: Array<CharacterSlotEntry | null>;
  regions: DraftRegion[];
}

export const EMPTY_HIGHLIGHT: HighlightState = {
  characters: [],
  objects: [],
  cells: [],
  regionBorders: [],
};

export function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function effectColorHex(color: EffectColor): string {
  return EFFECT_COLOR_HEX[color];
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

/** All anchor cells of a given `itemId` — MOD-708: multiple instances. */
export function findAllItemAnchors(
  cells: CellMap,
  itemId: number,
): Array<HighlightRect> {
  const result: HighlightRect[] = [];
  for (const [key, cell] of cells.entries()) {
    const object = cell.object;
    if (!object || object.itemId !== itemId) continue;
    const [x, y] = key.split(',').map(Number) as [number, number];
    result.push({ x, y, w: object.w, h: object.h, color: '' });
  }
  return result;
}

/**
 * Turns one participant's flat linkage list into concrete rectangles.
 *
 * MOD-708: `cell` targets have `cells` array; `item` targets have `scope`.
 * MOD-802: `region` targets always produce an inner blue border — click and
 * hover render identically.
 */
export function resolveHighlight(
  linkages: ParticipantTarget[] | undefined,
  ctx: HighlightContext,
): HighlightState | null {
  const targets = collectLinkages(linkages);
  if (targets.length === 0) return null;

  const characters = new Map<string, HighlightCharacter>();
  const objects = new Map<string, HighlightRect>();
  const cells = new Map<string, HighlightRect>();
  const regionBorders: Array<{ regionId: string; color: string }> = [];

  for (const { identity, target } of targets) {
    const color = effectColorHex(target.color);

    if (target.type === 'character') {
      const slotIndex = ctx.characterSlots.findIndex(
        (slot) => slot?.characterId === target.id,
      );
      if (slotIndex === -1) continue;
      characters.set(identity, { slotIndex, color });
      continue;
    }

    if (target.type === 'item') {
      const allAnchors = findAllItemAnchors(ctx.cells, target.id);
      if (allAnchors.length === 0) continue;
      if (target.scope === 'instances' && target.instances) {
        // Only highlight specific instance coords
        const instanceSet = new Set(
          target.instances.map(([x, y]) => `${x},${y}`),
        );
        for (const anchor of allAnchors) {
          if (instanceSet.has(`${anchor.x},${anchor.y}`)) {
            objects.set(`item:${target.id}:${anchor.x},${anchor.y}`, { ...anchor, color });
          }
        }
      } else {
        // scope === 'all' → highlight all instances
        for (const anchor of allAnchors) {
          objects.set(
            `item:${target.id}:${anchor.x},${anchor.y}`,
            { ...anchor, color },
          );
        }
      }
      continue;
    }

    if (target.type === 'cell') {
      for (const [cx, cy] of target.cells) {
        if (cx < 0 || cy < 0 || cx >= ctx.gridSize || cy >= ctx.gridSize) continue;
        cells.set(`cell:${cx},${cy}`, { x: cx, y: cy, w: 1, h: 1, color });
      }
      continue;
    }

    // region target — MOD-802: always the inner blue border.
    const region = ctx.regions.find((item) => item.id === target.id);
    if (!region) continue;
    regionBorders.push({ regionId: region.id, color: REGION_HIGHLIGHT_BORDER_COLOR });
  }

  if (
    characters.size === 0 &&
    objects.size === 0 &&
    cells.size === 0 &&
    regionBorders.length === 0
  ) {
    return null;
  }
  return {
    characters: [...characters.values()],
    objects: [...objects.values()],
    cells: [...cells.values()],
    regionBorders,
  };
}
