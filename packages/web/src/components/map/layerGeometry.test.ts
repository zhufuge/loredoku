import { describe, expect, it } from 'vitest';
import { ITEM_OFFSET_MAX, ITEM_SCALE_MAX } from '@loredoku/shared';
import { cellRectStyle, itemRectStyle } from './layerGeometry';

/**
 * v0.7.5 (docs/v0.7.5.md §4): 物品的展示矩形 = 脚位按中心缩放 + 按格偏移。
 *
 * 两条不能破的约定：
 * 1. 恒等变换与原 `cellRectStyle` **逐像素相同**（老草稿一个像素都不许动）；
 * 2. 缩放围绕中心，所以 `scale` 只改大小、不偷偷改位置 —— 否则作者要同时拧
 *    大小和偏移才能把物品摆回原处。
 */
describe('itemRectStyle', () => {
  it('matches the plain cell rect when there is no transform', () => {
    expect(itemRectStyle(3, 2, 100, { w: 2, h: 1 })).toEqual(cellRectStyle(3, 2, 100, 2, 1));
    expect(itemRectStyle(0, 0, 64, { w: 1, h: 1, scale: 1, offsetX: 0, offsetY: 0 })).toEqual({
      left: 0,
      top: 0,
      width: 64,
      height: 64,
    });
  });

  it('grows around the footprint centre, not the top-left corner', () => {
    // 1×1 at (1,1), 100px cells → 中心在 (150, 150)；放大 2 倍后仍是同一个中心。
    const rect = itemRectStyle(1, 1, 100, { w: 1, h: 1, scale: 2 });
    expect(rect).toEqual({ left: 50, top: 50, width: 200, height: 200 });
  });

  it('scales multi-cell footprints around their own centre', () => {
    // 2×2 at (0,0) → 中心 (100, 100)；缩到 50% 是 100×100，落在 (50, 50)。
    const rect = itemRectStyle(0, 0, 100, { w: 2, h: 2, scale: 0.5 });
    expect(rect).toEqual({ left: 50, top: 50, width: 100, height: 100 });
  });

  it('shifts by whole cells, negative allowed, and may leave the footprint', () => {
    // 中心 (250, 250) + 偏移 (-150, +50) → 盒子左上角再各减半宽 / 半高 50。
    const rect = itemRectStyle(2, 2, 100, { w: 1, h: 1, offsetX: -1.5, offsetY: 0.5 });
    expect(rect.left).toBe(50);
    expect(rect.top).toBe(250);
    // 画到格子外面这件事本身不是错误 —— 尺寸仍是 1 格。
    expect(rect.width).toBe(100);
  });

  it('clamps a hand-edited draft instead of drawing a 40× monster', () => {
    const huge = itemRectStyle(0, 0, 100, { w: 1, h: 1, scale: 40, offsetX: 99, offsetY: -99 });
    expect(huge.width).toBe(ITEM_SCALE_MAX * 100);
    // 1 格中心 50 + 夹到 4 格 = 450，再减去半宽 200。
    expect(huge.left).toBe(50 + ITEM_OFFSET_MAX * 100 - 200);
  });

  it('falls back to identity for garbage values', () => {
    const rect = itemRectStyle(0, 0, 100, { w: 1, h: 1, scale: Number.NaN, offsetX: Infinity });
    expect(rect).toEqual(cellRectStyle(0, 0, 100, 1, 1));
  });
});
