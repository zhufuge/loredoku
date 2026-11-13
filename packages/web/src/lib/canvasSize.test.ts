import { describe, expect, it } from 'vitest';
import {
  BORDER_WIDTH,
  BOTTOM_BAR_RESERVE,
  CANVAS_PADDING,
  EXTRA_MARGIN,
  DEFAULT_CELL_SIZE,
  MAX_CELL_SIZE,
  MIN_CELL_SIZE,
  RULER_SIZE,
} from '@loredoku/shared';
import {
  availableBox,
  canvasInsets,
  centeredPan,
  computeCellSize,
  computeCellSizeForInsets,
  computeWidthFitCellSize,
  isPortraitViewport,
  PORTRAIT_BREAKPOINT,
  PORTRAIT_MARGIN_X,
  PORTRAIT_MARGIN_Y,
  PORTRAIT_MIN_CELL_SIZE,
  PORTRAIT_STAGE_EXTRA,
  portraitInsets,
  portraitStageHeight,
  renderedCellSize,
  RENDER_MIN_CELL_SIZE,
  topAlignedPan,
} from './canvasSize';

describe('computeCellSize (OPT-A01 §1.1)', () => {
  it('never leaves the 8–240px render range', () => {
    // 作者能写进 `style.cellSize` 的下限仍是 32；渲染允许更小（v0.10.3）。
    expect(MIN_CELL_SIZE).toBe(32);
    expect(RENDER_MIN_CELL_SIZE).toBe(8);
    expect(MAX_CELL_SIZE).toBe(240);
    expect(DEFAULT_CELL_SIZE).toBe(MIN_CELL_SIZE);

    // A tiny board would love a huge cell — clamped to the maximum.
    expect(
      computeCellSize({ availableWidth: 4000, availableHeight: 4000, gridSize: 2 }),
    ).toBe(MAX_CELL_SIZE);
    // A 24×24 board in a small viewport shrinks below the comfortable 32
    // instead of overflowing: (600 - 23 * 2) / 24 = 23.08 → 23.
    expect(
      computeCellSize({ availableWidth: 600, availableHeight: 600, gridSize: 24 }),
    ).toBe(23);
    // Only a viewport too small for even that hits the render floor.
    expect(
      computeCellSize({ availableWidth: 100, availableHeight: 100, gridSize: 24 }),
    ).toBe(RENDER_MIN_CELL_SIZE);
  });

  it('derives the ideal width from the tighter axis', () => {
    // Wide but short viewport: the height decides.
    const cell = computeCellSize({ availableWidth: 4000, availableHeight: 500, gridSize: 4 });
    // (500 - 3 * 2) / 4 = 123.5 → 123（v0.10.3 起向下取整，宁少不溢）
    expect(cell).toBe(Math.floor((500 - 3 * BORDER_WIDTH) / 4));
  });

  it('accounts for the shared Border between neighbours', () => {
    // Without the gap the ideal would be exactly 100; the two 2px borders
    // shared by three neighbours push it to 98.5 → 98.
    const cell = computeCellSize({ availableWidth: 400, availableHeight: 400, gridSize: 4 });
    expect(cell).toBe(Math.floor((400 - 3 * BORDER_WIDTH) / 4));
    expect(cell).toBe(98);
  });

  it('covers every grid size from 2 to 24 without leaving the range', () => {
    for (let gridSize = 2; gridSize <= 24; gridSize += 1) {
      const cell = computeCellSize({
        availableWidth: 1440,
        availableHeight: 900,
        gridSize,
      });
      expect(cell).toBeGreaterThanOrEqual(RENDER_MIN_CELL_SIZE);
      expect(cell).toBeLessThanOrEqual(MAX_CELL_SIZE);
      expect(Number.isInteger(cell)).toBe(true);
    }
  });

  it('v0.10.3: every grid size fits the viewport instead of overflowing', () => {
    // 这正是下限从 32 放到 8 的原因：装得下才不会被 `overflow-hidden` 切掉。
    for (const [width, height] of [
      [1440, 900],
      [1280, 800],
      [1024, 768],
    ] as const) {
      const insets = canvasInsets({ showRulers: true, showBottomBar: false });
      const box = availableBox({ width, height }, insets);
      for (let gridSize = 2; gridSize <= 24; gridSize += 1) {
        const cell = computeCellSizeForInsets({ width, height, gridSize, insets });
        const board = gridSize * cell + (gridSize - 1) * BORDER_WIDTH;
        expect(board).toBeLessThanOrEqual(Math.min(box.width, box.height));
      }
    }
  });

  it('n = 2 approaches the maximum and n = 24 stays near the minimum', () => {
    const roomy = { availableWidth: 1440, availableHeight: 900 };
    expect(computeCellSize({ ...roomy, gridSize: 2 })).toBe(MAX_CELL_SIZE);
    // 24×24 在 1440×900 里是 36 —— **不再被下限夹住**（这正是下限放到 32 的目的），
    // 所以只要求它明显小于中等板子、且不低于下限。
    const dense = computeCellSize({ ...roomy, gridSize: 24 });
    expect(dense).toBeGreaterThanOrEqual(MIN_CELL_SIZE);
    expect(dense).toBeLessThan(computeCellSize({ ...roomy, gridSize: 6 }));
    // Monotonic: more cells never means wider cells.
    let previous = Number.POSITIVE_INFINITY;
    for (let gridSize = 2; gridSize <= 24; gridSize += 1) {
      const cell = computeCellSize({ ...roomy, gridSize });
      expect(cell).toBeLessThanOrEqual(previous);
      previous = cell;
    }
  });

  it('falls back to the render floor for degenerate input', () => {
    expect(computeCellSize({ availableWidth: 900, availableHeight: 900, gridSize: 0 })).toBe(
      RENDER_MIN_CELL_SIZE,
    );
    expect(
      computeCellSize({ availableWidth: Number.NaN, availableHeight: 900, gridSize: 6 }),
    ).toBe(RENDER_MIN_CELL_SIZE);
  });

  it('honours custom bounds and gap', () => {
    expect(
      computeCellSize({ availableWidth: 400, availableHeight: 400, gridSize: 4, gap: 0 }),
    ).toBe(100);
    expect(
      computeCellSize({ availableWidth: 400, availableHeight: 400, gridSize: 4, max: 60 }),
    ).toBe(60);
  });
});

describe('renderedCellSize (OPT-A01 §1.3)', () => {
  it('scales the base cell size by the zoom factor', () => {
    expect(renderedCellSize(120, 1)).toBe(120);
    expect(renderedCellSize(120, 2)).toBe(240);
    expect(renderedCellSize(120, 0.25)).toBe(30);
  });
});

// ---- OPT-B02 §2.2: asymmetric insets ----
describe('canvasInsets (OPT-B02 §2.2)', () => {
  it('reserves the ruler, the bottom toolbar, the padding and the extra margin', () => {
    const insets = canvasInsets({ showRulers: true, showBottomBar: true });
    expect(RULER_SIZE).toBe(28);
    expect(BOTTOM_BAR_RESERVE).toBe(72);
    expect(CANVAS_PADDING).toBe(16);
    expect(EXTRA_MARGIN).toBe(24);
    // base = 16 + 24 = 40 → top/left 28+40, bottom 72+40, right 40.
    expect(insets).toEqual({ top: 68, right: 40, bottom: 112, left: 68 });
  });

  it('drops the ruler / toolbar bands when they are hidden', () => {
    expect(canvasInsets()).toEqual({ top: 40, right: 40, bottom: 40, left: 40 });
    expect(canvasInsets({ showRulers: true })).toEqual({
      top: 68,
      right: 40,
      bottom: 40,
      left: 68,
    });
    expect(canvasInsets({ showBottomBar: true })).toEqual({
      top: 40,
      right: 40,
      bottom: 112,
      left: 40,
    });
  });

  it('OPT-C01: EXTRA_MARGIN is added to every side', () => {
    const without = canvasInsets({ showRulers: true, showBottomBar: true, extraMargin: 0 });
    const with24 = canvasInsets({ showRulers: true, showBottomBar: true });
    for (const side of ['top', 'right', 'bottom', 'left'] as const) {
      expect(with24[side] - without[side]).toBe(EXTRA_MARGIN);
    }
  });

  it('§2.2 + OPT-C01: availableH = 高度 - 72 - 28 - 32 - 48', () => {
    const height = 900;
    const box = availableBox(
      { width: 1200, height },
      canvasInsets({ showRulers: true, showBottomBar: true }),
    );
    expect(box.height).toBe(
      height - BOTTOM_BAR_RESERVE - RULER_SIZE - CANVAS_PADDING * 2 - EXTRA_MARGIN * 2,
    );
    expect(box.width).toBe(1200 - RULER_SIZE - CANVAS_PADDING * 2 - EXTRA_MARGIN * 2);
  });

  it('never reports a negative content box', () => {
    const box = availableBox(
      { width: 10, height: 10 },
      canvasInsets({ showRulers: true, showBottomBar: true }),
    );
    expect(box).toEqual({ width: 0, height: 0 });
  });
});

describe('computeCellSizeForInsets (§2.2)', () => {
  it('is the plain computation over the inset content area', () => {
    const insets = canvasInsets({ showRulers: true, showBottomBar: true });
    const box = availableBox({ width: 1280, height: 860 }, insets);
    expect(
      computeCellSizeForInsets({ width: 1280, height: 860, gridSize: 6, insets }),
    ).toBe(computeCellSize({ availableWidth: box.width, availableHeight: box.height, gridSize: 6 }));
  });

  it('§2.3: a short viewport shrinks the cell instead of clipping the board', () => {
    const insets = canvasInsets({ showRulers: true, showBottomBar: true });
    // 24 cells in a short viewport: 700×600 minus the bands → (600-68-112-23*2)/24 = 15.9
    // → 15 (floor). v0.10.3 stops at 8 instead of 32 so the whole board stays visible.
    expect(computeCellSizeForInsets({ width: 700, height: 600, gridSize: 24, insets })).toBe(15);
    // A roomy viewport still reaches the maximum.
    expect(computeCellSizeForInsets({ width: 3000, height: 3000, gridSize: 2, insets })).toBe(
      MAX_CELL_SIZE,
    );
  });
});

describe('centeredPan (OPT-B02 §2.2)', () => {
  it('centres the board inside the content box, not the raw viewport', () => {
    const insets = canvasInsets({ showRulers: true, showBottomBar: true });
    const rect = { width: 1000, height: 800 };
    const cellSize = 100;
    const pan = centeredPan(rect, insets, 6, cellSize);
    // Board = 600px; content box = (1000-68-40) × (800-68-112) = 892 × 620.
    const box = availableBox(rect, insets);
    expect(box).toEqual({ width: 892, height: 620 });
    expect(pan.x).toBe(Math.round(insets.left + (box.width - 600) / 2));
    expect(pan.y).toBe(Math.round(insets.top + (box.height - 600) / 2));
    expect(pan).toEqual({ x: 214, y: 78 });
    // The board never intrudes into the reserved bands.
    expect(pan.x).toBeGreaterThanOrEqual(insets.left);
    expect(pan.y).toBeGreaterThanOrEqual(insets.top);
    expect(pan.y + 6 * cellSize).toBeLessThanOrEqual(800 - insets.bottom);
  });

  it('scales the board with zoom before centring', () => {
    const insets = canvasInsets();
    const rect = { width: 600, height: 600 };
    const pan = centeredPan(rect, insets, 2, 100, 2);
    // Board = 2 × 100 × 2 = 400 → (600 - 40 - 40 - 400) / 2 = 60
    expect(pan).toEqual({ x: 40 + 60, y: 40 + 60 });
  });
});

describe('竖屏按宽度铺满（v0.10.1）', () => {
  it('只把「窄且竖着」算作竖屏', () => {
    expect(PORTRAIT_BREAKPOINT).toBe(768);
    // 手机竖屏。
    expect(isPortraitViewport(375, 812)).toBe(true);
    expect(isPortraitViewport(767, 900)).toBe(true);
    // 到断点就不算。
    expect(isPortraitViewport(768, 900)).toBe(false);
    // 桌面的竖窗口也算 —— 收掉视图簇的条件一致，不然按钮没了、棋盘还等宽。
    expect(isPortraitViewport(1000, 1200)).toBe(false);
    // 手机横过来：宽度仍不足 768，但受限的是高度，按宽度铺满会把棋盘顶出上下边。
    expect(isPortraitViewport(740, 360)).toBe(false);
    // 退化输入不抛。
    expect(isPortraitViewport(0, 0)).toBe(false);
    expect(isPortraitViewport(Number.NaN, 812)).toBe(false);
  });

  it('忽略高度，只按宽度分格子', () => {
    const insets = canvasInsets();
    // 375 宽、左右各 40 的留白 ⇒ 可用 295；24 格、格间 2px。
    // (295 - 23 * 2) / 24 = 10.375 → 向下取整 10。
    expect(computeWidthFitCellSize({ width: 375, gridSize: 24, insets })).toBe(10);
    // 同一宽度下「横着铺满」的桌面算法还要看高度：200 高减掉上下留白后只剩
    // 120，(120 - 46) / 24 = 3.08 → 触到渲染下限 8（v0.10.3 前是 32，会溢出）。
    expect(computeCellSizeForInsets({ width: 375, height: 200, gridSize: 24, insets })).toBe(
      RENDER_MIN_CELL_SIZE,
    );
  });

  it('铺满之后棋盘不会比可用宽度宽', () => {
    const insets = canvasInsets();
    for (const width of [320, 375, 414, 767]) {
      for (let gridSize = 2; gridSize <= 24; gridSize += 1) {
        const cell = computeWidthFitCellSize({ width, gridSize, insets });
        const board = gridSize * cell + (gridSize - 1) * BORDER_WIDTH;
        expect(board, `w${width} n${gridSize}`).toBeLessThanOrEqual(width - insets.left - insets.right);
      }
    }
  });

  it('下限比桌面那套低 —— 24×24 在小屏上仍要装得下', () => {
    expect(PORTRAIT_MIN_CELL_SIZE).toBe(8);
    expect(PORTRAIT_MIN_CELL_SIZE).toBeLessThan(MIN_CELL_SIZE);
    const insets = canvasInsets();
    // 320 宽的屏、可用 240：(240 - 46) / 24 = 8.08 → 8，没被 32 卡住。
    expect(computeWidthFitCellSize({ width: 320, gridSize: 24, insets })).toBe(8);
    // 再窄也不掉到 8 以下。
    expect(computeWidthFitCellSize({ width: 60, gridSize: 24, insets })).toBe(8);
  });

  it('格子上限仍然生效', () => {
    const insets = canvasInsets();
    // 2×2 在 375 宽里本可以铺到 147 一格，但仍受 MAX_CELL_SIZE 约束不至于夸张。
    expect(computeWidthFitCellSize({ width: 375, gridSize: 2, insets })).toBe(
      Math.min(MAX_CELL_SIZE, Math.floor((295 - BORDER_WIDTH) / 2)),
    );
    expect(computeWidthFitCellSize({ width: 4000, gridSize: 2, insets })).toBe(MAX_CELL_SIZE);
  });

  it('退化输入退回下限而不是 NaN', () => {
    const insets = canvasInsets();
    expect(computeWidthFitCellSize({ width: 375, gridSize: 0, insets })).toBe(PORTRAIT_MIN_CELL_SIZE);
    expect(computeWidthFitCellSize({ width: Number.NaN, gridSize: 6, insets })).toBe(
      PORTRAIT_MIN_CELL_SIZE,
    );
  });

  it('铺满之后横向居中、纵向贴住上边', () => {
    const insets = canvasInsets();
    const rect = { width: 375, height: 592 };

    // 棋盘比可视高度还高（24 × 40 = 960）—— 纵向贴住上边，别把第 1 行推到屏幕外。
    const tall = topAlignedPan(rect, insets, 24, 40);
    expect(tall.y).toBe(insets.top);
    // 横向仍居中，只是居中后是负数（棋盘比屏宽）—— 由父层的 overflow 裁掉。
    expect(tall.x).toBe(
      Math.round(insets.left + (375 - insets.left - insets.right - 24 * 40) / 2),
    );
  });

  it('装得下时纵向与 centeredPan 完全一致', () => {
    const insets = canvasInsets();
    const rect = { width: 375, height: 592 };
    expect(topAlignedPan(rect, insets, 6, 10)).toEqual(centeredPan(rect, insets, 6, 10));
  });
});

describe('竖屏四边留白与棋盘高度（v0.10.1）', () => {
  it('上下比左右宽一点，四面都很小', () => {
    expect(PORTRAIT_MARGIN_X).toBe(8);
    expect(PORTRAIT_MARGIN_Y).toBe(12);
    expect(PORTRAIT_MARGIN_Y).toBeGreaterThan(PORTRAIT_MARGIN_X);
    // 比桌面那套（左右各 40）小一个量级 —— 竖屏每一像素都从棋盘里扣。
    expect(PORTRAIT_MARGIN_X).toBeLessThan(CANVAS_PADDING + EXTRA_MARGIN);
    expect(portraitInsets()).toEqual({
      top: PORTRAIT_MARGIN_Y,
      right: PORTRAIT_MARGIN_X,
      bottom: PORTRAIT_MARGIN_Y,
      left: PORTRAIT_MARGIN_X,
    });
  });

  it('棋盘高度 = 边长 + 上下留白 + 下方那一段', () => {
    expect(PORTRAIT_STAGE_EXTRA).toBe(32);
    expect(portraitStageHeight(7, 49)).toBe(7 * 49 + 24 + 32);
    expect(portraitStageHeight(2, 100)).toBe(224 + 32);
    // 退化输入不抛 NaN，交给调用处。
    expect(portraitStageHeight(0, 0)).toBe(PORTRAIT_MARGIN_Y * 2 + PORTRAIT_STAGE_EXTRA);
  });

  it('按宽度铺满之后，棋盘横向装得进屏、纵向只由格子高度决定', () => {
    const insets = portraitInsets();
    for (const width of [320, 375, 414]) {
      for (let gridSize = 2; gridSize <= 24; gridSize += 1) {
        const cell = computeWidthFitCellSize({ width, gridSize, insets });
        const boardWidth = gridSize * cell + (gridSize - 1) * BORDER_WIDTH;
        expect(boardWidth, `w${width} n${gridSize}`).toBeLessThanOrEqual(
          width - insets.left - insets.right,
        );
        // 纵向没有格间：棋盘高就是格子总高，外加上下各一份留白与下方那段。
        expect(portraitStageHeight(gridSize, cell)).toBe(
          gridSize * cell + insets.top + insets.bottom + PORTRAIT_STAGE_EXTRA,
        );
      }
    }
  });
});
