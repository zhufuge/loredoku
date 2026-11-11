import {
  BORDER_WIDTH,
  BOTTOM_BAR_RESERVE,
  CANVAS_PADDING,
  EXTRA_MARGIN,
  MAX_CELL_SIZE,
  MIN_CELL_SIZE,
  RULER_SIZE,
} from '@loredoku/shared';

/**
 * OPT-A01 (docs/v0.3.5.md §1.1): the board fills the editor's available area.
 *
 * ```
 * cellByW = (availableW - (gridSize-1) * borderGap) / gridSize
 * cellByH = (availableH - (gridSize-1) * borderGap) / gridSize
 * idealCell = min(cellByW, cellByH)
 * finalCell = clamp(idealCell, 32, 240)
 * ```
 *
 * `borderGap` is the shared Border width between adjacent cells (2px) — see
 * OPT-A04. When the ideal cell would fall below the minimum the board
 * overflows and the editor scrolls (i.e. panning); when it would exceed the
 * maximum the board is centred with whitespace instead of stretching.
 */
export interface CellSizeInput {
  availableWidth: number;
  availableHeight: number;
  gridSize: number;
  /** Shared border width between neighbours; defaults to the Border width. */
  gap?: number;
  min?: number;
  max?: number;
}

export function computeCellSize(input: CellSizeInput): number {
  const {
    availableWidth,
    availableHeight,
    gridSize,
    gap = BORDER_WIDTH,
    min = MIN_CELL_SIZE,
    max = MAX_CELL_SIZE,
  } = input;
  if (!Number.isFinite(gridSize) || gridSize < 1) return min;

  const share = (available: number): number => (available - (gridSize - 1) * gap) / gridSize;
  const ideal = Math.min(share(availableWidth), share(availableHeight));
  if (!Number.isFinite(ideal)) return min;
  return Math.round(Math.min(max, Math.max(min, ideal)));
}

/**
 * OPT-A01 §1.3: the rendered width is `cellSize × zoom`, and zoom stays in
 * the 25%–400% range (see `clampZoom`).
 */
export function renderedCellSize(cellSize: number, zoom: number): number {
  return cellSize * zoom;
}

// ---- OPT-B02 §2.2: asymmetric viewport insets ----

export interface CanvasInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * OPT-B02 (docs/v0.3.6.md §2.2). The v0.3.5 pass used one symmetric padding,
 * which let the bottom toolbar cover the board. The inset is now per side:
 *
 * ```
 * availableH = 编辑器高度 - 底部工具条留白 72px - 顶部标尺 28px - 内边距 32px
 * ```
 */
export function canvasInsets(options: {
  /** Ruler strips sit inside the viewport along the top / left edges. */
  showRulers?: boolean;
  /** The editor's floating bottom toolbar reserves space under the board. */
  showBottomBar?: boolean;
  padding?: number;
  /** OPT-C01 extra margin; pass 0 to opt out (e.g. in tests). */
  extraMargin?: number;
  /**
   * v0.3.9 FEAT-E02: the ruler strip grows with the configured text size and
   * gap, so the reserved band has to follow it (defaults to `RULER_SIZE`).
   */
  rulerSize?: number;
} = {}): CanvasInsets {
  const {
    showRulers = false,
    showBottomBar = false,
    padding = CANVAS_PADDING,
    extraMargin = EXTRA_MARGIN,
    rulerSize = RULER_SIZE,
  } = options;
  const ruler = showRulers ? Math.max(RULER_SIZE, rulerSize) : 0;
  // OPT-C01 §2: `EXTRA_MARGIN` is added to every side, so the board gets more
  // breathing room all round instead of only along the toolbar edge.
  const base = padding + extraMargin;
  return {
    top: ruler + base,
    right: base,
    bottom: (showBottomBar ? BOTTOM_BAR_RESERVE : 0) + base,
    left: ruler + base,
  };
}

/** The area actually available to the board once the insets are removed. */
export function availableBox(
  rect: { width: number; height: number },
  insets: CanvasInsets,
): { width: number; height: number } {
  return {
    width: Math.max(0, rect.width - insets.left - insets.right),
    height: Math.max(0, rect.height - insets.top - insets.bottom),
  };
}

/** OPT-B02 §2.2 — the adaptive pass over the inset content area. */
export function computeCellSizeForInsets(input: {
  width: number;
  height: number;
  gridSize: number;
  insets: CanvasInsets;
  gap?: number;
  min?: number;
  max?: number;
}): number {
  const box = availableBox(input, input.insets);
  return computeCellSize({ ...input, availableWidth: box.width, availableHeight: box.height });
}

// ---- v0.10.1: portrait width-first fitting ----

/**
 * Tailwind 的 `md` 断点（768px）。
 *
 * 写在 TS 里是为了让「收起视图簇」那条 CSS（`portrait:max-md:hidden`）和下面
 * 的排版判定用同一个数字 —— 两边一旦漂移，就会出现「按钮没了、棋盘还按桌面
 * 算」或者「棋盘按宽度铺满了、按钮还在」的半吊子状态。`tailwind.config.ts`
 * 没有自定义 `screens`，所以 `md` 就是 Tailwind 默认的 768。
 */
export const PORTRAIT_BREAKPOINT = 768;

/**
 * 竖屏下格子允许缩到多小。
 *
 * 桌面那套 32px 下限（`MIN_CELL_SIZE`）是为了「格子还点得准」；可 24×24 的
 * 棋盘在 375 宽的屏上按宽度铺满只有 12px 左右一格，还守 32 就必然溢出、必须
 * 平移 —— 而竖屏把放大 / 缩小 / 重置那一簇收掉了，玩家没有把棋盘挪回来的手段。
 * 两害相权，允许它缩到 8px：先保证整张图在屏幕里。
 */
export const PORTRAIT_MIN_CELL_SIZE = 8;

/**
 * v0.10.1：竖屏下棋盘四周留多少。
 *
 * 左右只留 8px —— 375 宽的屏上每 8px 就是一整列格子，桌面那圈
 * `CANVAS_PADDING + EXTRA_MARGIN` 的 40px 在手机上等于白扔两列半。
 *
 * 上下留 12px，**比左右大一点**：棋盘上边贴着标题栏、下边贴着题面面板，
 * 上下完全没缝会读成「两块拼在一起」。但也不能多 —— 竖屏一屏就 812 高，
 * 上下多给的每一像素都是从「全局线索 + 参与者」那块里扣的。
 */
export const PORTRAIT_MARGIN_X = 8;
export const PORTRAIT_MARGIN_Y = 12;

/**
 * v0.10.1：竖屏棋盘那一块（`<main>`）在「棋盘 + 上下留白」之外再垫多少。
 *
 * 棋盘装得下时由 `centeredPan` 居中（每边各摊一半），装不下时由 `topAlignedPan`
 * 贴上边 —— 所以这 32px 撑开的是「标题栏与棋盘之间」「棋盘与题面面板之间」两条缝，
 * 让三块钱不至于贴成一片。
 */
export const PORTRAIT_STAGE_EXTRA = 32;

/** 竖屏专用的四边内边距（左右 8、上下 12，见上面的常量）。 */
export function portraitInsets(): CanvasInsets {
  return {
    top: PORTRAIT_MARGIN_Y,
    right: PORTRAIT_MARGIN_X,
    bottom: PORTRAIT_MARGIN_Y,
    left: PORTRAIT_MARGIN_X,
  };
}

/**
 * v0.10.1：竖屏下棋盘那一块（`<main>`）应当占多高。
 *
 * 竖屏的棋盘是按宽度定死的 —— 宽高都是 `gridSize × cellSize`，上下各留
 * `PORTRAIT_MARGIN_Y`，再加一段 `PORTRAIT_STAGE_EXTRA`。把这块高度**算出来**
 * 而不是让它 `flex-1` 吃掉剩余空间，是因为剩下的高度要留给下面的「全局线索 +
 * 参与者」：棋盘若继续 `flex-1`，小棋盘（2×2）会在下面拖出一大片空白，而面板
 * 反而只有 38svh。
 */
export function portraitStageHeight(gridSize: number, cellSize: number): number {
  return gridSize * cellSize + PORTRAIT_MARGIN_Y * 2 + PORTRAIT_STAGE_EXTRA;
}

/**
 * 竖屏判定：**窄**（宽度不到 `md` 断点）**且竖着**（高度大于宽度）。
 *
 * 为什么不是只看宽度：手机横过来（740×360）宽度也在 `md` 以下，但那时受限的
 * 是**高度** —— 按宽度铺满会把棋盘顶出上下边、而且横屏下放大 / 平移那一簇还
 * 在，能自己调。只有「竖着拿、按钮又收掉」这一种局面才需要按宽度铺满。
 *
 * 也不用 `matchMedia('(orientation: portrait)')`：`testing/matchMedia.ts` 那个
 * 桩的 `matches` 恒等于「是否深色」，用它判定会让整条分支在测试里失真。
 * 宽高比是同一件事，且是纯函数。
 */
export function isPortraitViewport(width: number, height: number): boolean {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return false;
  if (width <= 0 || height <= 0) return false;
  return width < PORTRAIT_BREAKPOINT && height > width;
}

/**
 * 按**宽度**铺满的格子尺寸（竖屏专用）。
 *
 * 与 `computeCellSize` 的差别有三处，都是有意的：
 * 1. 只看宽度、完全忽略高度 —— 竖屏要的是「一屏看全宽」，宁可往下超一点，
 *    也不为了塞进高度把棋盘缩成一条缝；
 * 2. 下限是 `PORTRAIT_MIN_CELL_SIZE`（8）而不是 `MIN_CELL_SIZE`（32）；
 * 3. 用 `Math.floor` 而不是 `Math.round` —— 宁可少半像素，也不让棋盘比可用
 *    宽度多出一线（多出来就得平移，而竖屏已经没有平移的按钮了）。
 */
export function computeWidthFitCellSize(input: {
  width: number;
  gridSize: number;
  insets: CanvasInsets;
  gap?: number;
  max?: number;
}): number {
  const { width, gridSize, insets, gap = BORDER_WIDTH, max = MAX_CELL_SIZE } = input;
  if (!Number.isFinite(gridSize) || gridSize < 1) return PORTRAIT_MIN_CELL_SIZE;
  const available = Math.max(0, width - insets.left - insets.right);
  const share = (available - (gridSize - 1) * gap) / gridSize;
  if (!Number.isFinite(share)) return PORTRAIT_MIN_CELL_SIZE;
  return Math.max(PORTRAIT_MIN_CELL_SIZE, Math.min(max, Math.floor(share)));
}

/**
 * Centres the board inside the inset content area (not the raw viewport), so
 * the reserved toolbar / ruler bands stay empty.
 */
export function centeredPan(
  rect: { width: number; height: number },
  insets: CanvasInsets,
  gridSize: number,
  cellSize: number,
  zoom = 1,
): { x: number; y: number } {
  const box = availableBox(rect, insets);
  const board = gridSize * cellSize * zoom;
  return {
    x: Math.round(insets.left + (box.width - board) / 2),
    y: Math.round(insets.top + (box.height - board) / 2),
  };
}

/**
 * v0.10.1：竖屏用的居中 —— **横向居中，纵向不许顶出上边**。
 *
 * 竖屏把放大 / 缩小 / 重置那一簇收掉了，玩家没有把棋盘挪回来的手段（触屏上
 * 也没有中键 / 空格平移）。棋盘按宽度铺满之后若比可视高度还高，`centeredPan`
 * 会把上下两头各切掉一部分、而且顶上一截永远够不着；这里改成贴住上边，让
 * 「第 1 行」始终看得见。
 */
export function topAlignedPan(
  rect: { width: number; height: number },
  insets: CanvasInsets,
  gridSize: number,
  cellSize: number,
  zoom = 1,
): { x: number; y: number } {
  const centered = centeredPan(rect, insets, gridSize, cellSize, zoom);
  const box = availableBox(rect, insets);
  const board = gridSize * cellSize * zoom;
  return { x: centered.x, y: board > box.height ? Math.round(insets.top) : centered.y };
}
