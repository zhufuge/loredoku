import type { CSSProperties } from 'react';
import {
  resolveItemTransform,
  type ItemTransformOverride,
} from '@loredoku/shared';

/**
 * Shared geometry for the map layer components (v0.5.6: split out of the old
 * `MapLayers.tsx`). Pixel rect for a cell — or a `w × h` footprint anchored at
 * `x, y`.
 */
export function cellRectStyle(
  x: number,
  y: number,
  cellSize: number,
  w = 1,
  h = 1,
): CSSProperties {
  return {
    left: x * cellSize,
    top: y * cellSize,
    width: w * cellSize,
    height: h * cellSize,
  };
}

/**
 * v0.7.5 (docs/v0.7.5.md §4): the pixel rect of a **placed item**, after its
 * display transform.
 *
 * 缩放围绕脚位的**中心**，不是左上角 —— 绕左上角放大会让物品一路往右下长，
 * 作者得同时拧大小和偏移才能把它摆回原地。以中心为锚点，`scale` 只管大小，
 * 位置交给偏移。
 *
 * 偏移单位是**格**：地图的 `cellSize` 可调（`MAP_STYLE_CELL_SIZE_MIN/MAX`），
 * 像素偏移换个格子大小就错位了。
 *
 * 恒等变换（`scale=1`、不偏移）算出来的四个值与 `cellRectStyle(x, y, cellSize, w, h)`
 * 逐像素相同，所以老草稿的渲染没有任何位移。
 */
export function itemRectStyle(
  x: number,
  y: number,
  cellSize: number,
  item: { w: number; h: number } & ItemTransformOverride,
): CSSProperties {
  const { scale, offsetX, offsetY } = resolveItemTransform(item);
  const width = item.w * cellSize * scale;
  const height = item.h * cellSize * scale;
  const centerX = (x + item.w / 2) * cellSize + offsetX * cellSize;
  const centerY = (y + item.h / 2) * cellSize + offsetY * cellSize;
  return {
    left: centerX - width / 2,
    top: centerY - height / 2,
    width,
    height,
  };
}

/** `"x,y"` cell key → `[x, y]`. */
export function parseKey(key: string): [number, number] {
  return key.split(',').map(Number) as [number, number];
}
