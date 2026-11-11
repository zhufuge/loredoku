import { MAX_CELL_SIZE } from '@loredoku/shared';

/**
 * v0.10.0：游戏内那块「定案」遮罩（`VerdictMark` 的 `large` 档）按棋盘大小等比缩。
 *
 * 理由：那一档的版式是照**桌面**定的 —— 128px 的两个字 + 192px 的印，再往右上
 * 让开 150px。桌面上棋盘动辄 480 起，压得住；手机上 2×2 棋盘只有 236px 见方，
 * 字会竖着顶出遮罩、印甩到棋盘外，底下那颗「再玩一次」也被压住。
 *
 * 参照尺寸取「两格都顶到上限」的棋盘（2×2 × `MAX_CELL_SIZE` = 480），也就是
 * 桌面小棋盘的样子：比它小的棋盘按比例缩，比它大的不放大（`large` 档再放就
 * 盖满整屏了）。
 */
export const VERDICT_BASE_BOARD = MAX_CELL_SIZE * 2;

/**
 * 缩小不低于这个比例。再小字就看不清了 —— 那时宁可让印偏出去一点，也不把
 * 「定案」做成一行小字。
 */
export const VERDICT_MIN_SCALE = 0.5;

/**
 * @param boardSize 棋盘渲染出来的边长（`gridSize * cellSize`，单位 px）
 * @returns 挂在 `VerdictMark` 根上的等比缩放，范围 `[VERDICT_MIN_SCALE, 1]`
 */
export function verdictMarkScale(boardSize: number): number {
  if (!Number.isFinite(boardSize) || boardSize <= 0) return 1;
  const ratio = boardSize / VERDICT_BASE_BOARD;
  if (ratio >= 1) return 1;
  return Math.max(VERDICT_MIN_SCALE, ratio);
}
