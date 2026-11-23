import type {
  CharacterSlotEntry,
  DraftCell,
  DraftRegion,
  PuzzleDraft,
} from './types/domain';

/** v0.5.0 FEAT-K01 (docs/v0.5.0.md §5.2) — 引用检查的**跨表**那一半：`asset` / `region` 的目标在引用的地图版本快照里，前后端都调它，导入的 JSON 才绕不过只在前端做的检查。 */

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

/** Every linkage whose `asset` / `region` target is missing from the referenced map version; `[]` means all resolve. Empty `cells` / `regions` is not an error — a bare canvas legitimately has neither. */
export function collectReferenceIssues(
  slots: ReadonlyArray<CharacterSlotEntry | null>,
  context: PuzzleRefContext,
): PuzzleRefIssue[] {
  // v0.11.11：联动目标可以是物品层、背景层或背景修饰层的资源，三层都算「在地图中」。
  const canvasAssetIds = new Set<number>();
  for (const cell of Object.values(context.cells)) {
    if (cell?.item) canvasAssetIds.add(cell.item.assetId);
    if (cell?.background) canvasAssetIds.add(cell.background.assetId);
    if (cell?.decoration) canvasAssetIds.add(cell.decoration.assetId);
  }
  const regionIds = new Set(context.regions.map((region) => region.id));

  const issues: PuzzleRefIssue[] = [];
  slots.forEach((slot, slotIndex) => {
    if (!slot) return;
    (slot.linkages ?? []).forEach((target, targetIndex) => {
      if (target.type === 'asset' && !canvasAssetIds.has(target.id)) {
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

/** v0.7.3 §3.5：「引入新地图」只换底图，联动目标却指向底图 —— 旧区域/资源不再存在会让草稿再也存不进去（`assertReferenceIssues` 会 400），所以一并摘掉；没东西可摘时返回**同一个数组引用**，调用方可跳过写回。 */
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
