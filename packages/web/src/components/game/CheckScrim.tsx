import type { CSSProperties } from 'react';
import { DIALOG_OVERLAY_TINT_CLASS } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/**
 * v0.9.4：核对期间四处**各自完整**的遮罩 —— 左栏、右栏、中列留白、画布底色层。
 *
 * 不再用全屏四块挖洞：
 * - 左右两栏本来就是独立的 `aside`，各盖一层即可（挡点击）；
 * - 中列（`main`）那一层铺满整个地图区，`z = saveMask(40)`，压住标尺条带与画布
 *   四周的留白；它**低于**画布纸（`canvasBase` 容器在校验时抬到 `saveMask+1`），
 *   所以棋盘本身照常明亮，只有纸以外的部分被压暗；
 * - 画布底色层那一层塞进 `canvasBase` 里（纸底之上、其余图层之下），只压暗没铺
 *   背景图的格子，铺了图 / 物品 / 头像 / 校验圈的格子照常亮。
 *
 * 颜色统一取弹窗 overlay 的 `DIALOG_OVERLAY_TINT_CLASS`，四处不会各说一套。
 *
 * v0.10.4：从 `GamePage` 搬到自己的文件 —— 四处的尺寸 / 层级仍由调用方给，
 * 这里只管「一般遮罩颜色 + 一处 aria 标记」。
 */
export function CheckScrim({
  area,
  className,
  style,
}: {
  area: 'left' | 'right' | 'canvas' | 'center';
  className?: string;
  style?: CSSProperties;
}): JSX.Element {
  return (
    <div
      aria-hidden="true"
      data-testid="check-scrim"
      data-scrim-area={area}
      className={cn(DIALOG_OVERLAY_TINT_CLASS, className)}
      style={style}
    />
  );
}
