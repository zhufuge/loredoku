import type { CellCoord, CharacterSlotEntry, GamePlacementBoard } from '@loredoku/shared';
import { avatarCellOf, type PlacementIssue } from '@/lib/gamePlacement';

/**
 * v0.9.3 §2：提交时逐人圈一遍的**名单** —— 按序号排，只有落了头像的才有格子可圈。
 *
 * 「通过 / 未通过」直接取自判卷结果（`issues` 里有这位的编号就是没过）。判卷与
 * 呈现因此用的是同一份结论，不会出现「圈是绿的、名单里却有他」。
 *
 * 只圈**落了头像**的人：编号格上没有人形，圈住一堆数字说不清是在核对谁。没
 * 落头像的那几位不上动画 —— 棋盘上没有可圈的格子；结论弹窗也不再列名字
 * （v0.9.4），只把绿圈的数量写成 `x/n 正确`。
 *
 * v0.10.4：从 `GamePage` 搬出来 —— 它是纯函数，跟那一页的二十几处状态无关，
 * 留在页面里只能被页面调一次。判卷那几条用例（`GamePage.test.tsx`）仍然从
 * 界面这一侧验它，不必单独给这份文件补一套。
 */
export interface CheckItem {
  participantId: number;
  cell: CellCoord;
  passed: boolean;
}

export function buildCheckItems(
  board: GamePlacementBoard,
  slots: Array<CharacterSlotEntry | null>,
  issues: readonly PlacementIssue[],
): CheckItem[] {
  const failed = new Set(issues.map((issue) => issue.participantId));
  const items: CheckItem[] = [];
  slots.forEach((slot, index) => {
    if (!slot) return;
    const participantId = index + 1;
    const cell = avatarCellOf(board, participantId);
    if (!cell) return;
    items.push({ participantId, cell, passed: !failed.has(participantId) });
  });
  return items;
}
