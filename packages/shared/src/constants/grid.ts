import { HIGHLIGHT_BLUE, HIGHLIGHT_RED } from './highlight';

// // 网格 / 画布 / 线宽 / 图层次序 / 标尺 —— 「一格有多大、线画在哪」。
// v0.10.4：从 `constants.ts`（1324 行、287 个导出）按主题拆开。值、注释、次序一律
// 照搬 —— 只是把「谁在用」相近的那些放在一个文件里，改一处不必在一千行里翻。
// 对外仍是同一组名字：`constants/index.ts` 全部再导出，`@loredoku/shared` 不变。

// Cross-package constants. Keep this file dependency-free (plain values only).
// Every decision reference (OPT-*/FEAT-*/SPEC-*) points at the doc that owns it.

// ---- Canvas / grid ----
export const GRID_SIZE_MIN = 2;
export const GRID_SIZE_MAX = 24;
export const GRID_SIZE_DEFAULT = 6;

/**
 * OPT-A01 (docs/v0.3.5.md §1.1): cell width range; `MIN` is also the pre-measure
 * fallback. v0.7.2 §7 把下限从 90 一路放到 32：它同时是「基本信息 → 方格边长」的
 * 可填最小值与自适应缩放的**下限**，下限太高会让 24×24 的板子在笔记本上必然溢出
 * 视口。32px 时 `cellScale` ≈ 0.267，线宽（2 × 0.267 = 0.53）刚好还在
 * `LINE_WIDTH_MIN` 之上，字号则一律被 `FONT_SIZE_MIN` 兜住。
 */
export const MIN_CELL_SIZE = 32;
export const MAX_CELL_SIZE = 240;
/** Alias used as the default cell width before the adaptive pass runs. */
export const DEFAULT_CELL_SIZE = MIN_CELL_SIZE;
/** Horizontal / vertical inset the adaptive pass leaves around the board. */
export const CANVAS_PADDING = 16;
/** OPT-B02 (docs/v0.3.6.md §2.2): height reserved for the floating bottom toolbar. */
export const BOTTOM_BAR_RESERVE = 72;
/** OPT-C01 (docs/v0.3.7.md §OPT-C01): extra outer margin on every side of the board. */
export const EXTRA_MARGIN = 24;

/** OPT-B03 (docs/v0.3.6.md §3.2): reference cell width that sizes are authored against. */
export const BASE_CELL = 120;
/** Guard rails so lines never vanish on small cells or bloat on big ones. */
export const LINE_WIDTH_MIN = 0.5;
export const LINE_WIDTH_MAX = 12;
export const FONT_SIZE_MIN = 9;
// v0.5.2 FIX-M08 (docs/v0.5.2.md §8): no font ceiling — the old 28px cap made
// "32px" render as 28px. Only the lower guard stays, so scale can't draw 0px text.

/**
 * OPT-A04 (docs/v0.3.5.md §3.2), named as 《方框要素定义与命名规范 v1.0》:
 * Border = the shared grid line, Outline = outside it, InnerLine = inside it.
 */
export const LINE_COLOR = '#000000';
export const BORDER_WIDTH = 2;
/** @deprecated OPT-B04 → {@link CANVAS_OUTER_BORDER_WIDTH}; alias kept for old imports. */
export const OUTLINE_WIDTH = 3;
/** OPT-C05 (docs/v0.3.7.md §OPT-C05): 1px → 2px so the mouse box reads like the operation box. */
export const INNER_LINE_WIDTH = 2;
/** Region outline width range — the region's own `style.outline.width` override. */
export const REGION_BORDER_WIDTH = 6;
/** OPT-B04 (docs/v0.3.6.md §4): the board frame never follows a region's custom outline width. */
export const CANVAS_OUTER_BORDER_WIDTH = REGION_BORDER_WIDTH;

// Deprecated aliases (kept so older imports keep compiling).
export const GRID_LINE_COLOR = LINE_COLOR;
export const GRID_LINE_WIDTH = BORDER_WIDTH;
export const GRID_BORDER_WIDTH = OUTLINE_WIDTH;

// ---- Canvas layer stacking (docs/layer-priority.md, the single authority) ----
/**
 * The canvas layers, **top-most first**, numbered exactly as
 * 《画布图层优先级规范》 (`docs/layer-priority.md` §2) — the single authority.
 * Keys are that document's 代码常量 names, so code, docs and
 * UI share one vocabulary. v0.4.0 SPEC-G01/G02 inserted the two game-only
 * layers between 区域标签 and 物品图层, renumbering the stack.
 */export const MAP_LAYER_ORDER = [
  'mouseCursorBox',
  'operationCursorBox',
  'regionLabel',
  'gameToolHint',
  'gamePlacement',
  'itemLayer',
  'regionOutline',
  'canvasFrame',
  'gridSeparator',
  'blockingMask',
  'regionHighlight',
  'cellHighlight',
  'backgroundHighlight',
  'backgroundLayer',
  'canvasBase',
] as const;

export type MapLayerName = (typeof MAP_LAYER_ORDER)[number];

export const MAP_LAYER_Z: Record<MapLayerName, number> = {
  /** 1 鼠标光标框 — follows the pointer, always top-most. */
  mouseCursorBox: 46,
  /** 2 操作光标框 — pinned to the clicked cell. */
  operationCursorBox: 45,
  /** 3 区域标签 */
  regionLabel: 42,
  /** 4 工具提示层 — v0.4.0 SPEC-G02, game-only hover preview. */
  gameToolHint: 41,
  /** 5 游戏放置层 — v0.4.0 SPEC-G01, game-only placements. */
  gamePlacement: 40,
  /** 6 物品图层 — above the grid lines so items are never cut by them. */
  itemLayer: 38,
  /** 7 区域轮廓线 — above 画布外框 / 网格分隔线, below the item layer. */
  regionOutline: 36,
  /** 8 画布外框 — 骑在画布边界上. */
  canvasFrame: 34,
  /** 9 网格分隔线（内部分隔线） */
  gridSeparator: 32,
  /** 10 阻挡遮罩 — below 区域轮廓线, above 区域高亮线. */
  blockingMask: 30,
  /** 11 区域高亮线 */
  regionHighlight: 28,
  /** 12 方块高亮 */
  cellHighlight: 26,
  /** 13 背景高亮 */
  backgroundHighlight: 24,
  /** 14 背景图层 */
  backgroundLayer: 20,
  /** 15 画布底色 */
  canvasBase: 10,
};

// ---- OPT-A05 当前方格辅助提示框（鼠标框 / 操作框） ----
/** OPT-A05 (docs/v0.3.5.md §4): the v0.3.4 single cursor box split into a mouse box and an operation box. */
/** Mouse box inner line on a free cell (§4.1). */
export const CELL_CURSOR_COLOR = '#FFFFFF';
/** Mouse box inner line on a non-standable cell (OPT-A06 §5.1 softened `#E57373`). */
export const CELL_CURSOR_BLOCKED_COLOR = HIGHLIGHT_RED;
/** Grey shadow that sits on top of the Border ring (§3.3.1). */
export const CELL_CURSOR_SHADOW_COLOR = 'rgba(0,0,0,0.15)';
/** Operation box colour — OPT-A06 §5.1 pale blue, drawn as an Outline. */
export const OPERATION_CURSOR_COLOR = HIGHLIGHT_BLUE;
export const OPERATION_CURSOR_OUTLINE_WIDTH = 2;
/** Distance from the cell edge, **as a percentage of one cell** (v0.10.7). */
export const OPERATION_CURSOR_OUTLINE_OFFSET = 1;
// ---- OPT-A03 §3.1 + OPT-A06 §5.2 阻挡物品阴影 ----
/** Deepened from `rgba(0,0,0,0.08)` to make blocking cells readable. */
export const BLOCKING_SHADOW_COLOR = 'rgba(0,0,0,0.18)';
// OPT-C03: `noStandShadow` / `canvasFrame` have their own `MAP_LAYER_Z` entries;
// the old `NO_STAND_SHADOW_Z` / `CANVAS_FRAME_Z` aliases are gone.

// ---- OPT-B05 标尺字符（docs/v0.3.6.md §5） ----
/** Ruler glyph base sizes; both are multiplied by the OPT-B03 `scale`. */
export const RULER_FONT_SIZE = 17;
/** The cell the operation box is pinned to gets the larger glyph (§5.3). */
export const RULER_FONT_SIZE_ACTIVE = 19;
/** OPT-C02 + v0.3.9 FEAT-E02: gap between the ruler text and the board. */
export const RULER_GAP = 6;
/**
 * v0.3.9 FEAT-E02: the operated row / column glyph is always this many px above
 * the idle one, so the relationship survives a custom `style.ruler.fontSize`.
 */
export const RULER_ACTIVE_FONT_DELTA = RULER_FONT_SIZE_ACTIVE - RULER_FONT_SIZE;
/** Idle colour — a light grey (§5.1). */
export const RULER_COLOR = '#9CA3AF';
/** Hovered / operated row & column — darker grey, deliberately not blue (§5.2). */
export const RULER_COLOR_HOVER = '#374151';
/** Height of the ruler strip along the top and left edges. */
export const RULER_SIZE = 28;
