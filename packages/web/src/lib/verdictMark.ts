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
 * v0.10.2：`large` 档在 `scale === 1` 时**实际占的盒子**（含印章外挑与整体右移）。
 *
 * 为什么要有这两个数：棋盘大小不总能代表屏幕上剩多少地方 —— 横屏手机棋盘按作者
 * 配的 `cellSize` 能到 900 多，而 `<main>` 只有一百来像素高；这时按棋盘算出来
 * 是「不用缩」，字就顶出可见区了（用户：「且大小要自适应屏幕」）。所以除了棋盘
 * 比例，还要再按**可见区**算一次，两者取小。
 *
 * 数值来自实测（1280×800 真浏览器）：字列 128×320、印 197×201 往右下挑出去，
 * 整块 311×320；再叠上 `shift` 的 72px 右移，横向占到 383（取整 384）。
 */
export const VERDICT_MARK_WIDTH = 384;
export const VERDICT_MARK_HEIGHT = 320;

/**
 * 遮罩里「定案」下面那颗按钮占的高度：`gap-6`（24px）+ `h-10`（40px）。
 * 它不跟着缩，所以算可用高度时先把它扣掉。
 */
export const VERDICT_BUTTON_BLOCK = 64;

/** 可见区尺寸（`<main>` 的宽高，px）。 */
export interface VerdictStageBox {
  width: number;
  height: number;
}

/**
 * v0.10.2：**卡片档**（`large === false`，`text-7xl` + `h-24` 的印）原样摆开时
 * 占的盒子。
 *
 * 为什么卡片也要按比例缩：卡片封面是 `aspect-square`，`/play` 四列时只有 136px
 * 见方，而这一档按 72px 的字摆出来是 192px 高 —— 竖写的「定案」顶上要探出封面
 * 29px、左边也要探出 20px（实测 `word 113×192 @ (-3, 1462)`，封面 `@ (17, 1491)`）。
 * 用户：「字和印大小自适应还不够，在卡片小的占据面积太大了」。
 *
 * 数值来自实测（1280×800 真浏览器，卡片封面 136×136）：字列 113×192、印 86×85
 * 往右下挑，整块 168×192。
 */
export const VERDICT_CARD_MARK_WIDTH = 168;
export const VERDICT_CARD_MARK_HEIGHT = 192;

/**
 * 卡片上「定案 + 印」最多占封面短边的几成。
 *
 * 0.78 是让整块**铺满封面大半、但四边都留出封面的底**：卡片是列表里的一格，
 * 蒙版本身还有 `bg-background/55` 那一层在讲「这一关结了」，字再顶满就把它读成
 * 一张纯色块了。
 */
export const VERDICT_CARD_FILL = 0.78;

/**
 * 卡片档按封面尺寸算缩放：取宽、高两支里小的那个，且**只缩不放**（上限 1）。
 *
 * `box` 拿不到（还没量出来、或者量到 0）时返 1 —— 与 `verdictMarkScale` 同一个
 * 理由：挂载那一瞬不闪一下小的。
 */
export function verdictCardScale(box?: VerdictStageBox | null): number {
  if (!box || box.width <= 0 || box.height <= 0) return 1;
  const ratio = Math.min(
    (box.width * VERDICT_CARD_FILL) / VERDICT_CARD_MARK_WIDTH,
    (box.height * VERDICT_CARD_FILL) / VERDICT_CARD_MARK_HEIGHT,
  );
  if (ratio >= 1) return 1;
  return Math.max(VERDICT_MIN_SCALE, ratio);
}

/**
 * @param boardSize 棋盘渲染出来的边长（`gridSize * cellSize`，单位 px）
 * @param stage 可见区的宽高；不给就只按棋盘算（v0.10.0 的老行为）
 * @returns 挂在 `VerdictMark` 根上的等比缩放，范围 `[VERDICT_MIN_SCALE, 1]`
 */
export function verdictMarkScale(boardSize: number, stage?: VerdictStageBox | null): number {
  const byBoard =
    Number.isFinite(boardSize) && boardSize > 0 ? boardSize / VERDICT_BASE_BOARD : 1;
  /*
   * v0.10.2：再按可见区算一次。宽高都给不出有效值时（`fit` 还没跑、尺寸是 0）
   * 不参与，免得挂载瞬间闪一下小的。
   */
  const byStage =
    stage && stage.width > 0 && stage.height > 0
      ? Math.min(
          stage.width / VERDICT_MARK_WIDTH,
          Math.max(0, stage.height - VERDICT_BUTTON_BLOCK) / VERDICT_MARK_HEIGHT,
        )
      : 1;
  const ratio = Math.min(byBoard, byStage);
  if (ratio >= 1) return 1;
  return Math.max(VERDICT_MIN_SCALE, ratio);
}
