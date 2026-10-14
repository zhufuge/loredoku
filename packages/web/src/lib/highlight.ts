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
 * CLAR-603: characters are no longer placed on the map; highlight requests
 * resolve roster slots to a synthetic anchor (slot index → pseudo-cell).
 * The renderer doesn't draw a map character layer any more, so the only
 * remaining highlight branches are objects, cells and regions.
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
}

export interface HighlightContext {
  gridSize: number;
  cells: CellMap;
  /**
   * Roster slots — same shape as `MapDraft.characterSlots`. The slot index
   * becomes the highlight character identity.
   */
  characterSlots: Array<CharacterSlotEntry | null>;
  regions: DraftRegion[];
}

export const EMPTY_HIGHLIGHT: HighlightState = { characters: [], objects: [], cells: [] };

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
      return `cell:${target.x},${target.y}`;
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

/** Anchor cell of the first placed object instance of `itemId`. */
export function findItemAnchor(cells: CellMap, itemId: number): HighlightRect | null {
  for (const [key, cell] of cells.entries()) {
    const object = cell.object;
    if (!object || object.itemId !== itemId) continue;
    const [x, y] = key.split(',').map(Number) as [number, number];
    return { x, y, w: object.w, h: object.h, color: '' };
  }
  return null;
}

/**
 * Turns the declarative participant triggers into concrete rectangles.
 * Unknown / dangling references are skipped so a stale config never breaks
 * rendering (the zod schema already rejects them on save).
 *
 * CLAR-603: `characters` no longer carry a cell coordinate — instead we
 * return the slot index so the roster panel can outline the avatar.
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

  for (const { identity, target } of targets) {
    const color = effectColorHex(target.color);

    if (target.type === 'character') {
      // Find the roster slot holding this character.
      const slotIndex = ctx.characterSlots.findIndex(
        (slot) => slot?.characterId === target.id,
      );
      if (slotIndex === -1) continue;
      characters.set(identity, { slotIndex, color });
      continue;
    }

    if (target.type === 'item') {
      const rect = findItemAnchor(ctx.cells, target.id);
      if (!rect) continue;
      objects.set(identity, { ...rect, color });
      continue;
    }

    if (target.type === 'cell') {
      if (target.x < 0 || target.y < 0 || target.x >= ctx.gridSize || target.y >= ctx.gridSize) {
        continue;
      }
      cells.set(identity, { x: target.x, y: target.y, w: 1, h: 1, color });
      continue;
    }

    const region = ctx.regions.find((item) => item.id === target.id);
    if (!region) continue;
    for (const [x, y] of region.cells) {
      cells.set(`region:${region.id}:${x},${y}`, { x, y, w: 1, h: 1, color });
    }
  }

  if (characters.size === 0 && objects.size === 0 && cells.size === 0) return null;
  return {
    characters: [...characters.values()],
    objects: [...objects.values()],
    cells: [...cells.values()],
  };
}
