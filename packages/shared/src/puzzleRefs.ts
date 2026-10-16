import type { DraftCell, DraftRegion, PuzzleDraft } from './types/domain';

/**
 * v0.5.0 FEAT-K01 (docs/v0.5.0.md §5.2) — the **cross-table** half of the
 * puzzle reference check.
 *
 * A puzzle linkage may point at four kinds of target. Two of them live inside
 * the puzzle payload and are checked by `puzzleDraftSchema`:
 *
 *   - `character` → the puzzle's own `characterSlots`
 *   - `cell`      → the puzzle's own `gridSize`
 *
 * The other two live in the **map version snapshot** the puzzle references, so
 * the schema cannot see them:
 *
 *   - `item`   → an object anchor in the map's `cells`
 *   - `region` → a `regions[i].id` of the map
 *
 * This module is the single implementation of that second half; both the web
 * (before save / before import) and the server (`puzzleService.save`) call it,
 * so an imported JSON cannot slip past a front-end-only check.
 */

/** The canvas part of a map version snapshot — everything this check needs. */
export interface PuzzleRefContext {
  cells: Record<string, DraftCell>;
  regions: DraftRegion[];
}

export interface PuzzleRefIssue {
  /** 0-based roster slot the offending linkage belongs to. */
  slotIndex: number;
  /** 0-based index of the linkage inside that slot. */
  targetIndex: number;
  /** Chinese, user-facing — the caller shows it verbatim. */
  message: string;
}

/**
 * Returns every linkage whose `item` / `region` target is missing from the
 * referenced map version. An empty array means "all cross-table references
 * resolve".
 *
 * `cells` / `regions` being empty is **not** an error by itself — a map with a
 * bare canvas legitimately has neither.
 */
export function validatePuzzleReferences(
  draft: PuzzleDraft,
  context: PuzzleRefContext,
): PuzzleRefIssue[] {
  const objectItemIds = new Set<number>();
  for (const cell of Object.values(context.cells)) {
    if (cell?.object) objectItemIds.add(cell.object.itemId);
  }
  const regionIds = new Set(context.regions.map((region) => region.id));

  const issues: PuzzleRefIssue[] = [];
  draft.characterSlots.forEach((slot, slotIndex) => {
    if (!slot) return;
    (slot.linkages ?? []).forEach((target, targetIndex) => {
      if (target.type === 'item' && !objectItemIds.has(target.id)) {
        issues.push({
          slotIndex,
          targetIndex,
          message: `参与者框 ${slotIndex + 1} 的联动目标物品 #${target.id} 不在地图中`,
        });
      }
      if (target.type === 'region' && !regionIds.has(target.id)) {
        issues.push({
          slotIndex,
          targetIndex,
          message: `参与者框 ${slotIndex + 1} 的联动目标区域 ${target.id} 不在地图中`,
        });
      }
    });
  });
  return issues;
}
