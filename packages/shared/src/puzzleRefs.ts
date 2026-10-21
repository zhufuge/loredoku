import type {
  CharacterSlotEntry,
  DraftCell,
  DraftRegion,
  PuzzleDraft,
} from './types/domain';

/**
 * v0.5.0 FEAT-K01 (docs/v0.5.0.md §5.2) — the **cross-table** half of the puzzle
 * reference check. `puzzleDraftSchema` can check `character` / `cell` (inside the
 * payload), but `asset` / `region` live in the referenced **map version snapshot**.
 * Web (before save / import) and server (`puzzleService.save`) both call this, so
 * an imported JSON cannot slip past a front-end-only check.
 *
 * v0.7.3：判定本身收在 {@link collectReferenceIssues}，因为「引入新地图」要拿同
 * 一份判定做**反向**用途 —— 不是报错，而是把换底图后悬空的联动摘掉。
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
 * Every linkage whose `asset` / `region` target is missing from the referenced
 * map version; `[]` means all resolve. Empty `cells` / `regions` is not an
 * error — a bare canvas legitimately has neither.
 */
export function collectReferenceIssues(
  slots: ReadonlyArray<CharacterSlotEntry | null>,
  context: PuzzleRefContext,
): PuzzleRefIssue[] {
  const itemAssetIds = new Set<number>();
  for (const cell of Object.values(context.cells)) {
    if (cell?.item) itemAssetIds.add(cell.item.assetId);
  }
  const regionIds = new Set(context.regions.map((region) => region.id));

  const issues: PuzzleRefIssue[] = [];
  slots.forEach((slot, slotIndex) => {
    if (!slot) return;
    (slot.linkages ?? []).forEach((target, targetIndex) => {
      if (target.type === 'asset' && !itemAssetIds.has(target.id)) {
        issues.push({
          slotIndex,
          targetIndex,
          message: `参与者框 ${slotIndex + 1} 的联动目标资源 #${target.id} 不在地图中`,
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

/** Draft-shaped wrapper, kept for the save / import / publish guards. */
export function validatePuzzleReferences(
  draft: PuzzleDraft,
  context: PuzzleRefContext,
): PuzzleRefIssue[] {
  return collectReferenceIssues(draft.characterSlots, context);
}

export interface PuzzleRefPruneResult {
  /** The roster with the unresolvable `asset` / `region` linkages dropped. */
  slots: Array<CharacterSlotEntry | null>;
  /** What was dropped — the caller reports the count. */
  removed: PuzzleRefIssue[];
}

/**
 * Drops every linkage that points at an item / region the given canvas does not
 * have (v0.7.3 §3.5).
 *
 * 「引入新地图」只换底图，但联动里的 `asset` / `region` 目标是**指向底图**的：
 * 旧画布上的区域 id 在新画布上通常不存在，留着这份草稿就再也存不进去
 * （`assertReferenceIssues` 会 400）。所以换底图时一并摘掉这些目标。
 *
 * 没东西可摘时返回**同一个数组引用**，调用方可以据此跳过无谓的写回。
 */
export function prunePuzzleReferences(
  slots: ReadonlyArray<CharacterSlotEntry | null>,
  context: PuzzleRefContext,
): PuzzleRefPruneResult {
  const issues = collectReferenceIssues(slots, context);
  if (issues.length === 0) return { slots: slots as Array<CharacterSlotEntry | null>, removed: [] };

  const drop = new Map<number, Set<number>>();
  for (const issue of issues) {
    const set = drop.get(issue.slotIndex) ?? new Set<number>();
    set.add(issue.targetIndex);
    drop.set(issue.slotIndex, set);
  }

  const next = slots.map((slot, slotIndex) => {
    const dropSet = drop.get(slotIndex);
    if (!slot || !dropSet) return slot;
    return {
      ...slot,
      linkages: (slot.linkages ?? []).filter((_, index) => !dropSet.has(index)),
    };
  });
  return { slots: next, removed: issues };
}
