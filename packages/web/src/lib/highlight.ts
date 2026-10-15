import {
  EFFECT_COLOR_HEX,
  type CharacterSlotEntry,
  type DraftCell,
  type DraftRegion,
  type EffectColor,
  type ParticipantTarget,
  type ParticipantTrigger,
  type ParticipantTriggerKey,
} from '@murdoku/shared';

export type CellMap = Map<string, DraftCell>;

export interface HighlightRect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Resolved `#RRGGBB` colour of the effect. */
  color: string;
}

/**
 * CLAR-603 + MOD-701: characters are no longer placed on the map; highlight
 * requests resolve roster slots. The renderer doesn't draw a map character
 * layer, so the only remaining highlight branches are objects, cells and
 * regions.
 *
 * MOD-701: click trigger = persistent (3s, scale 1.08 for chars),
 *          touch trigger = transient (1s, no scale).
 * We carry `triggerKey` so the caller knows which duration to apply.
 */
export interface HighlightCharacter {
  /** Slot index of the participant to outline in the roster panel. */
  slotIndex: number;
  color: string;
  /** Whether this came from a click (3s, scale) or touch (1s, no scale). */
  trigger: ParticipantTriggerKey;
}

/** Fully resolved highlight request: everything the renderer needs. */
export interface HighlightState {
  characters: HighlightCharacter[];
  objects: HighlightRect[];
  cells: HighlightRect[];
  /** The trigger that produced this state (controls duration / behaviour). */
  trigger?: ParticipantTriggerKey;
  /** Region border outlines (MOD-709: touch → blue border inside). */
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

/** Flattens the triggers of one group into de-duplicated targets (later wins). */
export function collectTriggerTargets(
  triggers: ParticipantTrigger[] | undefined,
  trigger: ParticipantTriggerKey,
): TargetSummary[] {
  const byIdentity = new Map<string, ParticipantTarget>();
  for (const group of triggers ?? []) {
    if (group.trigger !== trigger) continue;
    for (const target of group.targets) {
      byIdentity.set(targetIdentity(target), target);
    }
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
 * Turns the declarative participant triggers into concrete rectangles.
 *
 * MOD-708: `cell` targets have `cells` array; `item` targets have `scope`.
 * MOD-709: `region` touch → border outline; click → fill.
 */
export function resolveHighlight(
  triggers: ParticipantTrigger[] | undefined,
  trigger: ParticipantTriggerKey,
  ctx: HighlightContext,
): HighlightState | null {
  const targets = collectTriggerTargets(triggers, trigger);
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
      characters.set(identity, { slotIndex, color, trigger });
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

    // region target
    const region = ctx.regions.find((item) => item.id === target.id);
    if (!region) continue;
    if (trigger === 'touch') {
      // MOD-709: touch → border outline
      regionBorders.push({ regionId: region.id, color: '#3B82F6' });
    } else {
      // click → fill all region cells
      for (const [x, y] of region.cells) {
        cells.set(`region:${region.id}:${x},${y}`, { x, y, w: 1, h: 1, color });
      }
    }
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
    trigger,
  };
}