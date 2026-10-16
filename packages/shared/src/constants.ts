/**
 * Cross-package constants shared by server and web.
 * Keep this file free of runtime dependencies (types + plain values only).
 */

// ---- Canvas / grid ----
export const GRID_SIZE_MIN = 2;
export const GRID_SIZE_MAX = 24;
export const GRID_SIZE_DEFAULT = 6;

/**
 * OPT-A01 (docs/v0.3.5.md §1.1): the board fills the editor's available area
 * and the cell width is clamped to this range. `MIN_CELL_SIZE` is also the
 * fallback used before the adaptive pass has measured anything.
 */
export const MIN_CELL_SIZE = 90;
export const MAX_CELL_SIZE = 240;
/** Alias used as the default cell width before the adaptive pass runs. */
export const DEFAULT_CELL_SIZE = MIN_CELL_SIZE;
/** Horizontal / vertical inset the adaptive pass leaves around the board. */
export const CANVAS_PADDING = 16;
/**
 * OPT-B02 (docs/v0.3.6.md §2.2): the bottom toolbar floats over the canvas, so
 * the adaptive height subtracts a fixed reserve for it (toolbar + breathing
 * room = 72px). `availableH = height - 72 - 28(ruler) - 32(padding)`.
 */
export const BOTTOM_BAR_RESERVE = 72;
/**
 * OPT-C01 (docs/v0.3.7.md §OPT-C01): an extra outer margin added to **every**
 * side of the inset content box, so the board gets more breathing room and
 * the four sides read more evenly.
 */
export const EXTRA_MARGIN = 24;

/**
 * OPT-B03 (docs/v0.3.6.md §3.2): every line width and font size is authored
 * against this reference cell width and multiplied by `cellSize / BASE_CELL`.
 */
export const BASE_CELL = 120;
/** Guard rails so lines never vanish on small cells or bloat on big ones. */
export const LINE_WIDTH_MIN = 0.5;
export const LINE_WIDTH_MAX = 12;
export const FONT_SIZE_MIN = 9;
/**
 * v0.5.2 FIX-M08 (docs/v0.5.2.md §8): there is **no upper bound** any more.
 * The old 28px ceiling silently flattened every custom font size above it —
 * setting the region label to 32px rendered 28px, i.e. "changed but unchanged".
 * Only the lower guard remains, so a degenerate scale can't draw 0px text.
 */

/**
 * OPT-A04 (docs/v0.3.5.md §3.2): the four line elements of a cell, named as
 * in 《方框要素定义与命名规范 v1.0》.
 *
 * - Border    — the grid line; adjacent cells share one, so no double lines.
 * - Outline   — drawn outside the Border, does not take part in layout.
 * - InnerLine — drawn flush inside the Border.
 */
export const LINE_COLOR = '#000000';
export const BORDER_WIDTH = 2;
/**
 * @deprecated v0.3.6 OPT-B04 replaced the 3px outer frame with
 * {@link CANVAS_OUTER_BORDER_WIDTH} (the default region border width, 6px).
 * Kept only because `GRID_BORDER_WIDTH` is still exported as an alias.
 */
export const OUTLINE_WIDTH = 3;
/**
 * OPT-C05 (docs/v0.3.7.md §OPT-C05): calibrated from 1px to 2px so the mouse
 * cursor box reads as clearly as the operation box. The grey ring that covers
 * the Border is a separate 2px shadow (`BORDER_WIDTH`).
 */
export const INNER_LINE_WIDTH = 2;
/** Region outline width range — the region's own `borderWidth` attribute. */
export const REGION_BORDER_WIDTH = 6;
/**
 * OPT-B04 (docs/v0.3.6.md §4): the board's outermost frame uses the **default**
 * region border width and never follows a region's customised `borderWidth`.
 */
export const CANVAS_OUTER_BORDER_WIDTH = REGION_BORDER_WIDTH;

// Deprecated aliases (kept so older imports keep compiling).
export const GRID_LINE_COLOR = LINE_COLOR;
export const GRID_LINE_WIDTH = BORDER_WIDTH;
export const GRID_BORDER_WIDTH = OUTLINE_WIDTH;

// ---- Item ----
export const ITEM_NAME_MAX_LENGTH = 100;
export const ITEM_CODE_MAX_LENGTH = 64;
export const ITEM_CODE_PATTERN = /^[A-Za-z0-9_]+$/;
export const ITEM_CATEGORIES = ['background', 'object'] as const;
export const DEFAULT_ITEM_CATEGORY = 'object';
export const ITEM_SIZE_MIN = 1;
export const ITEM_SIZE_MAX = 12;
export const ITEM_SIZE_DEFAULT = 1;
export const ITEM_CATEGORY_LABELS: Record<(typeof ITEM_CATEGORIES)[number], string> = {
  background: '背景',
  object: '物体',
};
export const ITEM_FIT_MODES = ['cover', 'contain'] as const;
export const DEFAULT_ITEM_FIT_MODE = 'cover';

// ---- Editor layers ----
export const EDITOR_LAYERS = ['background', 'object'] as const;

// Deprecated (v1 rotation no longer used; kept for legacy migration typings).
export const CARD_ROTATIONS = [0, 90, 180, 270] as const;

// Backward-compatible aliases (prefer the ITEM_* constants).
export const CARD_NAME_MAX_LENGTH = ITEM_NAME_MAX_LENGTH;
export const CARD_CODE_MAX_LENGTH = ITEM_CODE_MAX_LENGTH;
export const CARD_CODE_PATTERN = ITEM_CODE_PATTERN;

// ---- Region ----
export const REGION_NAME_MAX_LENGTH = 100;
export const REGION_DESCRIPTION_MAX_LENGTH = 500;
export const REGION_BORDER_WIDTH_MIN = 4;
export const REGION_BORDER_WIDTH_MAX = 12;
export const REGION_BORDER_WIDTH_DEFAULT = 6;
export const REGION_FILL_OPACITY_MIN = 0;
export const REGION_FILL_OPACITY_MAX = 1;
export const REGION_FILL_OPACITY_DEFAULT = 0;
export const REGION_TRANSPARENT_FILL_OPACITY = 0.3;
export const DEFAULT_REGION_COLOR = '#000000';
export const REGION_SHAPES = ['rect', 'brush'] as const;
export const REGION_ID_MAX_LENGTH = 64;
export const REGION_ID_PATTERN = /^[A-Za-z0-9_]+$/;

// ---- Character ----
export const CHARACTER_NAME_MAX_LENGTH = 100;
export const CHARACTER_CODE_MAX_LENGTH = 64;
export const CHARACTER_CODE_PATTERN = /^[A-Za-z0-9_]+$/;
export const CHARACTER_DESCRIPTION_MAX_LENGTH = 500;
export const CHARACTER_AVATAR_MAX_DIMENSION = 256;
export const CHARACTER_SLOT_COUNT = 20;

// CLAR-601: gender is restricted to `male` / `female`; default is `male`.
export const CHARACTER_GENDERS = ['male', 'female'] as const;
export const DEFAULT_CHARACTER_GENDER = 'male';
export const CHARACTER_GENDER_LABELS: Record<(typeof CHARACTER_GENDERS)[number], string> = {
  male: '男',
  female: '女',
};
/** Small glyph shown next to a character name; every character always has one. */
export const CHARACTER_GENDER_GLYPHS: Record<(typeof CHARACTER_GENDERS)[number], string> = {
  male: '♂',
  female: '♀',
};
// OPT-601: tinted gender glyphs (male = light blue, female = light pink).
export const GENDER_SYMBOL_COLORS: Record<(typeof CHARACTER_GENDERS)[number], string> = {
  male: '#7DB9E8',
  female: '#F4A9C0',
};

// ---- Appearance (v0.5.1 FEAT-L01 / FEAT-L02 / SPEC-L03) ----
/**
 * An item / character can render either as an uploaded image or as a **colour
 * block** (`bgColor`). A colour block needs no upload at all, so it can be
 * activated straight away.
 */
export const APPEARANCE_MODES = ['image', 'color'] as const;
export const DEFAULT_APPEARANCE_MODE = 'image';
export const APPEARANCE_MODE_LABELS: Record<(typeof APPEARANCE_MODES)[number], string> = {
  image: '图片',
  color: '纯色块',
};
/** Accepted colour format: `#RRGGBB` (6 hex digits, case-insensitive). */
export const BG_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
/** Default colour of a freshly created colour block. */
export const DEFAULT_BG_COLOR = '#FFFFFF';

// ---- Project ----
export const PROJECT_NAME_MAX_LENGTH = 100;
export const PROJECT_DESCRIPTION_MAX_LENGTH = 500;
export const PROJECT_STATUSES = ['draft', 'published'] as const;
export const DEFAULT_PROJECT_STATUS = 'draft';
export const PROJECT_NOTE_MAX_LENGTH = 200;

// ---- Puzzle (v0.5.0 FEAT-K01 / FEAT-K08) ----
/**
 * v0.5.0 FEAT-K08: the puzzle draft payload. A puzzle owns what used to live
 * on the map's draft — participants (clue / linkages / position conditions)
 * and the linkage-colour palette — and only **references** a published map
 * version for its canvas (`PuzzleDraft.map`), so the canvas data itself is
 * not part of this payload.
 */
export const PUZZLE_JSON_VERSION = 1;
export const PUZZLE_NAME_MAX_LENGTH = 100;
export const PUZZLE_DESCRIPTION_MAX_LENGTH = 500;

// ---- Map draft JSON ----
/**
 * v0.5.0 FEAT-K14: bumped to 3 because the map draft no longer carries the
 * roster (`characterSlots` moved to `PuzzleDraft`) and `style` no longer
 * carries `linkageColors` (the palette moved to the puzzle too). Both schemas
 * are `.strict()`, so v2 payloads are **rejected** — the server absorbs them
 * on read (`service/mapDraftCompat.ts`) instead of re-writing the database.
 *
 * v0.3.8 FEAT-D02 bumped it to 2 for the `style` block; `version = 1`
 * payloads stay valid because a missing `style` resolves to `DEFAULT_MAP_STYLE`.
 */
export const MAP_JSON_VERSION = 3;

// ---- Trigger effects ----
export const EFFECT_TYPES = ['highlight', 'glow', 'blink', 'tooltip'] as const;

// ---- Highlight palette (OPT-A06, docs/v0.3.5.md §5.1) ----
/**
 * OPT-A06 §5.1 centralises the interaction colours so the whole board can be
 * re-tuned in one place. v0.3.5 softens both highlights: the deep
 * `#E53935` / `#3B82F6` pair becomes the pale `#EF9A9A` / `#90CAF9`.
 *
 * Deliberately **not** covered here (user-configurable, §5.1 不调整):
 * participant theme colours, region colours, item artwork, and the black
 * grid lines.
 */
export const HIGHLIGHT_RED = '#EF9A9A';
export const HIGHLIGHT_BLUE = '#90CAF9';

// ---- Participant linkage (docs/v0.3.0.md FEAT-502, v0.3.3 MOD-801) ----
// MOD-801: click/touch trigger grouping is gone — linkages are a flat list.
export const PARTICIPANT_TARGET_TYPES = ['character', 'item', 'cell', 'region'] as const;
export const EFFECT_COLORS = ['red', 'blue'] as const;
export const EFFECT_COLOR_HEX: Record<(typeof EFFECT_COLORS)[number], string> = {
  red: HIGHLIGHT_RED,
  blue: HIGHLIGHT_BLUE,
};
export const EFFECT_COLOR_LABELS: Record<(typeof EFFECT_COLORS)[number], string> = {
  red: '红',
  blue: '蓝',
};
/**
 * MOD-802 (docs/v0.3.3.md): region highlights are a fixed inner blue
 * border — the linkage's red/blue parameter does not apply to regions.
 * OPT-A06 §5.1: the blue is the softened `#90CAF9`.
 */
export const REGION_HIGHLIGHT_BORDER_COLOR = HIGHLIGHT_BLUE;
/** OPT-B01 (docs/v0.3.6.md §1.1): 2px → 4px, growing **inwards**. */
export const REGION_HIGHLIGHT_WIDTH = 4;
export const DEFAULT_THEME_COLOR = '#FFFFFF';
/**
 * MOD-801 (docs/v0.3.3.md §1.1.1): the v0.3.2 palette is darkened by
 * ~12% (no fluorescent / bright colours), one new deep mist blue
 * (`#5B7C99`) is added, and the near-duplicate teal `#0F766E` is
 * dropped so the palette stays at 15 swatches. `#FFFFFF` is kept as
 * the default (unset) theme colour.
 */
export const THEME_COLOR_PALETTE = [
  '#FFFFFF',
  '#000000',
  '#5B616D',
  '#763B10',
  '#A37643',
  '#BB201D',
  '#C74B0A',
  '#AC7503',
  '#138B3F',
  '#0B7E74',
  '#6931C9',
  '#BA2165',
  '#A2144F',
  '#1A3695',
  '#5B7C99',
] as const;

// ---- Canvas layer stacking (docs/layer-priority.md, the single authority) ----
/**
 * The canvas layers, listed **top-most first** exactly as
 * 《画布图层优先级规范》(`docs/layer-priority.md` §2) numbers them.
 * `MAP_LAYER_Z` turns that order into the CSS `z-index` values used by the
 * renderer (higher = closer to the viewer).
 *
 * v0.3.9 SPEC-E01 renames every key to the规范 name from that document's §1
 * table (中文 / English / 代码常量), so code, docs and UI share one
 * vocabulary:
 *
 * | # | 中文 | English | key |
 * |---|---|---|---|
 * | 1 | 鼠标光标框 | Mouse Cursor Box | `mouseCursorBox` |
 * | 2 | 操作光标框 | Operation Cursor Box | `operationCursorBox` |
 * | 3 | 区域标签 | Region Label | `regionLabel` |
 * | 4 | 工具提示层 | Game Tool Hint Layer | `gameToolHint` |
 * | 5 | 游戏放置层 | Game Placement Layer | `gamePlacement` |
 * | 6 | 物件图层 | Object Layer | `objectLayer` |
 * | 7 | 画布外框 | Canvas Frame | `canvasFrame` |
 * | 8 | 网格分隔线 | Grid Separator | `gridSeparator` |
 * | 9 | 区域轮廓线 | Region Outline | `regionOutline` |
 * | 10 | 不可站立遮罩 | Non-standable Mask | `nonStandableMask` |
 * | 11 | 区域高亮线 | Region Highlight | `regionHighlight` |
 * | 12 | 方块高亮 | Cell Highlight | `cellHighlight` |
 * | 13 | 背景高亮 | Background Highlight | `backgroundHighlight` |
 * | 14 | 背景图层 | Background Layer | `backgroundLayer` |
 * | 15 | 画布底色 | Canvas Base | `canvasBase` |
 *
 * v0.4.0 SPEC-G01 / SPEC-G02 insert the two game-only layers between
 * 区域标签 and 物件图层 (工具提示层 above 游戏放置层), so the existing
 * z-index values are renumbered to keep the stack strictly descending.
 */
export const MAP_LAYER_ORDER = [
  'mouseCursorBox',
  'operationCursorBox',
  'regionLabel',
  'gameToolHint',
  'gamePlacement',
  'objectLayer',
  'canvasFrame',
  'gridSeparator',
  'regionOutline',
  'nonStandableMask',
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
  /** 6 物件图层 — above the grid lines so items are never cut by them. */
  objectLayer: 38,
  /** 7 画布外框 — drawn outside the board rectangle. */
  canvasFrame: 36,
  /** 8 网格分隔线（内部分隔线） */
  gridSeparator: 34,
  /** 9 区域轮廓线 — below the grid lines so the separators stay readable. */
  regionOutline: 32,
  /** 10 不可站立遮罩 — below 区域轮廓线, above 区域高亮线. */
  nonStandableMask: 30,
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

/**
 * 区域填充 is a v0.2.5 leftover that the layer table does not list. It is
 * parked between 背景图层 (12) and 背景高亮 (11) — see `docs/layer-priority.md` §1.
 */
export const REGION_FILL_Z = MAP_LAYER_Z.backgroundLayer + 2;

// ---- Map style (v0.3.8 FEAT-D02) ----
/**
 * Every visual constant of the board is a **map-level default** that the
 * 「地图基本信息」drawer edits. Line widths and font sizes are authored at
 * `BASE_CELL` and still multiplied by `cellSize / BASE_CELL` (v0.3.6 OPT-B03),
 * so one configuration reads the same at `n = 2` and `n = 24`.
 */
export const MAP_STYLE_LINE_WIDTH_MIN = 1;
export const MAP_STYLE_LINE_WIDTH_MAX = 12;
export const MAP_STYLE_OPERATION_OFFSET_MIN = 0;
export const MAP_STYLE_OPERATION_OFFSET_MAX = 8;
export const MAP_STYLE_REGION_LABEL_FONT_MIN = 9;
export const MAP_STYLE_REGION_LABEL_FONT_MAX = 48;
export const MAP_STYLE_REGION_LABEL_STROKE_MIN = 0;
export const MAP_STYLE_REGION_LABEL_STROKE_MAX = 12;
/** v0.3.9 FEAT-E02: ruler text size and text→board gap. */
export const MAP_STYLE_RULER_FONT_MIN = 9;
export const MAP_STYLE_RULER_FONT_MAX = 32;
export const MAP_STYLE_RULER_GAP_MIN = 0;
export const MAP_STYLE_RULER_GAP_MAX = 32;
export const MAP_STYLE_CELL_SIZE_MIN = MIN_CELL_SIZE;
export const MAP_STYLE_CELL_SIZE_MAX = MAX_CELL_SIZE;

/** `#RRGGBB` — the only colour format the style accepts. */
export const MAP_STYLE_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

// ---- v0.5.2 SPEC-M07: 「基本信息」默认值（docs/v0.5.2.md §7.1）----
/**
 * These are **defaults only**. The older `BORDER_WIDTH` / `INNER_LINE_WIDTH` /
 * `CANVAS_OUTER_BORDER_WIDTH` / `RULER_FONT_SIZE` … constants stay as they are
 * because `canvasMetrics` (and the tests that pin it) still read them; the
 * shipped `DEFAULT_MAP_STYLE` now points at this dedicated set instead.
 */
export const STYLE_DEFAULT_RULER_FONT_SIZE = 24;
export const STYLE_DEFAULT_RULER_GAP = 24;
export const STYLE_DEFAULT_REGION_OUTLINE_WIDTH = 12;
export const STYLE_DEFAULT_REGION_HIGHLIGHT_WIDTH = 12;
/** §7: the region highlight line is the strong blue `#3b82f6`. */
export const STYLE_DEFAULT_REGION_HIGHLIGHT_COLOR = '#3B82F6';
export const STYLE_DEFAULT_CANVAS_FRAME_WIDTH = 12;
export const STYLE_DEFAULT_GRID_SEPARATOR_WIDTH = 4;
export const STYLE_DEFAULT_MOUSE_CURSOR_WIDTH = 8;
export const STYLE_DEFAULT_OPERATION_CURSOR_WIDTH = 8;
export const STYLE_DEFAULT_REGION_LABEL_FONT_SIZE = 32;
export const STYLE_DEFAULT_REGION_LABEL_STROKE_WIDTH = 10;
/** §2: the hovered label must be **larger** than the idle one (32 → 36). */
export const STYLE_DEFAULT_REGION_LABEL_HOVER_FONT_SIZE = 36;

// ---- v0.5.2 FEAT-M01: 虚拟列表 ----
/** Fixed row height (px) shared by the item and character lists. */
export const LIST_ROW_HEIGHT = 64;

/** Linkage palette bounds (FEAT-D04). */
export const LINKAGE_COLOR_MIN_COUNT = 2;
export const LINKAGE_COLOR_MAX_COUNT = 12;
export const LINKAGE_COLOR_KEY_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;
export const LINKAGE_COLOR_LABEL_MAX_LENGTH = 16;

/**
 * FEAT-D04 §「默认至少有红蓝」: the shipped palette. `red` / `blue` are the
 * historical `EFFECT_COLORS` keys, so v0.3.3-and-earlier drafts keep working
 * without a migration.
 *
 * v0.5.0: the palette lives on the **puzzle** (`PuzzleDraft.linkageColors`)
 * instead of `MapStyle.linkageColors`; this constant is its default.
 */
export const DEFAULT_LINKAGE_COLORS = [
  { key: 'red', label: '红', color: HIGHLIGHT_RED },
  { key: 'blue', label: '蓝', color: HIGHLIGHT_BLUE },
] as const;


// ---- OPT-A05 当前方格辅助提示框（鼠标框 / 操作框） ----
/**
 * OPT-A05 (docs/v0.3.5.md §4): the v0.3.4 single cursor box is split into a
 * mouse box (follows the pointer) and an operation box (pinned to the clicked
 * cell). Both may be visible on the same cell, with the mouse box on top.
 */
/** Mouse box inner line when the hovered cell is free (§4.1). */
export const CELL_CURSOR_COLOR = '#FFFFFF';
/** Mouse box inner line when the hovered cell holds a non-standable object.
 *  OPT-A06 §5.1 softens the v0.3.4 `#E57373` to the pale red. */
export const CELL_CURSOR_BLOCKED_COLOR = HIGHLIGHT_RED;
/** Grey shadow that sits on top of the Border ring (§3.3.1). */
export const CELL_CURSOR_SHADOW_COLOR = 'rgba(0,0,0,0.15)';
/** Operation box colour — OPT-A06 §5.1 pale blue, drawn as an Outline. */
export const OPERATION_CURSOR_COLOR = HIGHLIGHT_BLUE;
export const OPERATION_CURSOR_OUTLINE_WIDTH = 2;
/** Distance from the cell edge (an Outline sits outside the Border). */
export const OPERATION_CURSOR_OUTLINE_OFFSET = 1;

// ---- OPT-A03 §3.1 + OPT-A06 §5.2 不可站立物体阴影 ----
/** Deepened from `rgba(0,0,0,0.08)` to make blocked cells readable. */
export const NO_STAND_SHADOW_COLOR = 'rgba(0,0,0,0.18)';
/* OPT-C03: `noStandShadow` / `canvasFrame` now have their own entries in
 * `MAP_LAYER_Z`, so the previous `NO_STAND_SHADOW_Z` / `CANVAS_FRAME_Z`
 * aliases are gone — the layer list is the only source of truth. */

// ---- 区域名称 ----
/** The outline is one notch thicker than v0.3.3 (3px → 4px). */
export const REGION_LABEL_STROKE_WIDTH = 4;
/** OPT-C04: 14 → 17px base (still multiplied by the OPT-B03 scale). */
export const REGION_LABEL_FONT_SIZE = 17;
export const REGION_LABEL_COLOR = '#FFFFFF';
export const REGION_LABEL_STROKE_COLOR = '#000000';

// ---- 区域悬停 ----
/**
 * Hovering a region tints its label blue and enlarges it (v0.3.5 §2.2).
 * OPT-C04: raised to 19px so it stays **larger** than the new 17px base.
 */
export const REGION_LABEL_HOVER_FONT_SIZE = 19;

// ---- OPT-C06 物件层内边距 ----
/**
 * OPT-C06 (docs/v0.3.7.md §OPT-C06): object-layer artwork is inset inside its
 * cell so it never touches the grid lines. Backgrounds still fill the cell.
 */
export const OBJECT_PADDING_BASE = 4;
export const OBJECT_PADDING_MIN = 2;
export const OBJECT_PADDING_MAX = 12;

// ---- OPT-902 §2.3 物品悬停 ----
/** The object image stretches upward by this many pixels while hovered. */
export const OBJECT_HOVER_LIFT_PX = 4;
export const OBJECT_HOVER_TRANSITION_MS = 120;

// ---- OPT-B05 标尺字符（docs/v0.3.6.md §5） ----
/** Ruler glyph base sizes; both are multiplied by the OPT-B03 `scale`. */
export const RULER_FONT_SIZE = 17;
/** The cell the operation box is pinned to gets the larger glyph (§5.3). */
export const RULER_FONT_SIZE_ACTIVE = 19;
/** OPT-C02 + v0.3.9 FEAT-E02: gap between the ruler text and the board. */
export const RULER_GAP = 6;
/**
 * v0.3.9 FEAT-E02: the operated row / column glyph is always this many px
 * larger than the idle one (v0.3.6 §5.3 shipped 17 → 19), so the relationship
 * survives a custom `style.ruler.fontSize`.
 */
export const RULER_ACTIVE_FONT_DELTA = RULER_FONT_SIZE_ACTIVE - RULER_FONT_SIZE;
/** Idle colour — a light grey (§5.1). */
export const RULER_COLOR = '#9CA3AF';
/** Hovered / operated row & column — darker grey, deliberately not blue (§5.2). */
export const RULER_COLOR_HOVER = '#374151';
/** Height of the ruler strip along the top and left edges. */
export const RULER_SIZE = 28;

// ---- OPT-B06 参与者区（docs/v0.3.6.md §6） ----
/** Minimum participant cell width; the height stays at the v0.3.5 value. */
export const PARTICIPANT_MIN_WIDTH = 110;
/** Participant title bar height, kept in sync with the item panel header. */
export const PARTICIPANT_HEADER_HEIGHT = 40;
/** Participant cell minimum height (v0.3.5 OPT-A02). */
export const PARTICIPANT_MIN_HEIGHT = 104;
/** Clue display area under the avatar (3 lines). */
export const PARTICIPANT_CLUE_HEIGHT = 72;
/** Gap between participant cells. */
export const PARTICIPANT_CELL_GAP = 14;
/** Minimum avatar diameter (v0.3.5 OPT-A02). */
export const PARTICIPANT_AVATAR_MIN = 56;
/** OPT-B06 §6.3: the sequence badge tucked into the cell's top-left corner. */
export const PARTICIPANT_SEQ_INSET = 4;
export const PARTICIPANT_SEQ_FONT_SIZE = 12;
export const PARTICIPANT_SEQ_COLOR = '#374151';
/** Translucent white so the badge stays readable on any theme colour. */
export const PARTICIPANT_SEQ_BACKGROUND = 'rgba(255,255,255,0.85)';
export const PARTICIPANT_SEQ_BORDER = '1px solid rgba(0,0,0,0.1)';

// ---- v0.3.8 FEAT-D02 地图基本信息（地图级缺省值） ----
/**
 * The full set of map-level display constants, as edited by the
 * 「地图基本信息」drawer (docs/v0.3.8.md §FEAT-D02).
 *
 * Everything here is a **default**: per-object settings (a region's own
 * `borderWidth`, participant theme colours, item artwork) still win. The one
 * exception is 区域轮廓线 colour, which is global — the region's own `color`
 * now only drives the fill.
 *
 * v0.3.9 SPEC-E01: field names follow the layer naming table, so
 * `border` → `gridSeparator`, `regionBorder` → `regionOutline`,
 * `mouseCursor` → `mouseCursorBox`, `operationCursor` → `operationCursorBox`.
 */
export interface MapStyleLine {
  width: number;
  color: string;
}

export interface MapStyleMouseCursorBox extends MapStyleLine {
  /** Stroke colour over a cell whose object has `canStand === false`. */
  blockedColor: string;
  /** Ring drawn over the grid separator so the box stays readable. */
  shadowColor: string;
}

export interface MapStyleOperationCursorBox extends MapStyleLine {
  /** Distance from the cell edge — an Outline sits outside the grid line. */
  offset: number;
}

export interface MapStyleRegionLabel {
  fontSize: number;
  strokeWidth: number;
  color: string;
  strokeColor: string;
  hoverFontSize: number;
  hoverColor: string;
  hoverStrokeColor: string;
}

/** v0.3.9 FEAT-E02: ruler text size + the text→board gap. */
export interface MapStyleRuler {
  fontSize: number;
  gap: number;
}

export interface MapLinkageColor {
  /** Referenced by `ParticipantTarget.color`. */
  key: string;
  label: string;
  color: string;
}

export interface MapStyle {
  /** `null` = use the adaptive cell size; otherwise an explicit override. */
  cellSize: number | null;
  canvasFrame: MapStyleLine;
  gridSeparator: MapStyleLine;
  mouseCursorBox: MapStyleMouseCursorBox;
  operationCursorBox: MapStyleOperationCursorBox;
  regionLabel: MapStyleRegionLabel;
  regionOutline: MapStyleLine;
  regionHighlight: MapStyleLine;
  ruler: MapStyleRuler;
}

/**
 * Declared **after** every constant it reads — a module-level literal that
 * referenced a later `const` would hit the temporal dead zone on import.
 */
export const DEFAULT_MAP_STYLE: MapStyle = {
  /** FEAT-D03: `null` means "whatever the first adaptive pass computed". */
  cellSize: null,
  // v0.5.2 SPEC-M07: every geometric default now comes from the dedicated
  // `STYLE_DEFAULT_*` set (docs/v0.5.2.md §7).
  canvasFrame: { width: STYLE_DEFAULT_CANVAS_FRAME_WIDTH, color: LINE_COLOR },
  gridSeparator: { width: STYLE_DEFAULT_GRID_SEPARATOR_WIDTH, color: LINE_COLOR },
  mouseCursorBox: {
    width: STYLE_DEFAULT_MOUSE_CURSOR_WIDTH,
    color: CELL_CURSOR_COLOR,
    blockedColor: CELL_CURSOR_BLOCKED_COLOR,
    shadowColor: CELL_CURSOR_SHADOW_COLOR,
  },
  operationCursorBox: {
    width: STYLE_DEFAULT_OPERATION_CURSOR_WIDTH,
    color: OPERATION_CURSOR_COLOR,
    offset: OPERATION_CURSOR_OUTLINE_OFFSET,
  },
  regionLabel: {
    fontSize: STYLE_DEFAULT_REGION_LABEL_FONT_SIZE,
    strokeWidth: STYLE_DEFAULT_REGION_LABEL_STROKE_WIDTH,
    color: REGION_LABEL_COLOR,
    strokeColor: REGION_LABEL_STROKE_COLOR,
    hoverFontSize: STYLE_DEFAULT_REGION_LABEL_HOVER_FONT_SIZE,
    hoverColor: REGION_LABEL_COLOR,
    hoverStrokeColor: STYLE_DEFAULT_REGION_HIGHLIGHT_COLOR,
  },
  regionOutline: {
    width: STYLE_DEFAULT_REGION_OUTLINE_WIDTH,
    color: DEFAULT_REGION_COLOR,
  },
  regionHighlight: {
    width: STYLE_DEFAULT_REGION_HIGHLIGHT_WIDTH,
    color: STYLE_DEFAULT_REGION_HIGHLIGHT_COLOR,
  },
  ruler: { fontSize: STYLE_DEFAULT_RULER_FONT_SIZE, gap: STYLE_DEFAULT_RULER_GAP },
};

// ---- Editor tools ----
export const EDITOR_TOOLS = ['select', 'region', 'character', 'eraser', 'pan'] as const;
export const MAX_HISTORY_STEPS = 50;

// ---- v0.4.0 games (docs/v0.4.0.md §5 / §7 / §10) ----
/**
 * FEAT-G02: the five difficulty tiers a deployed game can carry. The colours
 * form a green → lime → amber → orange → red ramp, deliberately outside the
 * linkage palette so a difficulty badge never reads as a linkage theme.
 */
export const GAME_DIFFICULTY_LEVELS = ['veryEasy', 'easy', 'medium', 'hard', 'expert'] as const;

export const GAME_DIFFICULTY_LABELS: Record<(typeof GAME_DIFFICULTY_LEVELS)[number], string> = {
  veryEasy: 'Very Easy',
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  expert: 'Expert',
};

export const GAME_DIFFICULTY_LABELS_ZH: Record<(typeof GAME_DIFFICULTY_LEVELS)[number], string> = {
  veryEasy: '极简',
  easy: '简单',
  medium: '中等',
  hard: '困难',
  expert: '专家',
};

export const GAME_DIFFICULTY_COLORS: Record<(typeof GAME_DIFFICULTY_LEVELS)[number], string> = {
  veryEasy: '#22C55E',
  easy: '#84CC16',
  medium: '#EAB308',
  hard: '#F97316',
  expert: '#EF4444',
};

/** FEAT-G02: the default tier pre-selected in the deploy dialog. */
export const GAME_DIFFICULTY_DEFAULT: (typeof GAME_DIFFICULTY_LEVELS)[number] = 'medium';

/** FEAT-G02: game name bounds (same width as a map project name). */
export const GAME_NAME_MAX_LENGTH = 100;

/** FEAT-G02: covers are the widest artwork in the app, so they get their own cap. */
export const GAME_COVER_MAX_DIMENSION = 960;

/**
 * FEAT-H03 / OPT-H04 (docs/v0.4.2.md §3 / §4): a map's cover artwork uses the
 * same 16:10 frame as a game cover, so the grid card, the list thumbnail and
 * the dialog preview all agree on one ratio.
 */
export const MAP_COVER_ASPECT = 16 / 10;
/** FEAT-H03: stored map covers are capped like game covers. */
export const MAP_COVER_MAX_DIMENSION = 960;

/**
 * SPEC-G01: a cell is divided into a 3×3 grid for participant numbers, so at
 * most nine of them fit. The number font is `cellSize / 4`.
 */
export const GAME_NUMBER_GRID = 3;
export const GAME_NUMBER_GRID_CELLS = GAME_NUMBER_GRID * GAME_NUMBER_GRID;
export const GAME_NUMBER_FONT_RATIO = 0.25;
export const GAME_NUMBER_STROKE_RATIO = 0.08;

/**
 * SPEC-G01 §7.1: the forbidden `×` is drawn as bold text at this fraction of
 * the cell size — large enough to read as a marker, small enough that it never
 * spills outside the cell.
 */
export const GAME_FORBIDDEN_FONT_RATIO = 0.62;

/** SPEC-G02: the tool-hint `×` glyph — deep green with a black stroke. */
export const GAME_TOOL_HINT_FORBIDDEN_COLOR = '#15803D';
export const GAME_TOOL_HINT_ERASER_COLOR = '#374151';

/** SPEC-G04: long-pressing the clear button wipes the whole board. */
export const GAME_LONG_PRESS_MS = 500;
/** SPEC-G04: the undo stack keeps at most this many placement steps. */
export const GAME_PLACEMENT_HISTORY_MAX = 200;

/** SPEC-G03: the toolbar / participant-placement modes are mutually exclusive. */
export const GAME_TOOL_MODES = ['forbidden', 'clearing'] as const;

// ---- v0.4.1 games (docs/v0.4.1.md §4 / §5) ----
/**
 * OPT-W04: a deployed game owns a human-readable access path, built as
 * `puzzle-` + slugified name + `-` + slugified difficulty.
 */
export const GAME_SLUG_PREFIX = 'puzzle';
export const GAME_SLUG_MIN_LENGTH = 3;
/** Doubles as the DB column width of `map_games.slug`. */
export const GAME_SLUG_MAX_LENGTH = 80;
/** Only lower-case letters, digits and single dashes — no unicode, no spaces. */
export const GAME_SLUG_PATTERN = /^[a-z0-9-]+$/;

/** OPT-W04 §4.3: difficulty → URL segment (never leak `veryEasy` camelCase). */
export const GAME_DIFFICULTY_SLUGS: Record<(typeof GAME_DIFFICULTY_LEVELS)[number], string> = {
  veryEasy: 'very-easy',
  easy: 'easy',
  medium: 'medium',
  hard: 'hard',
  expert: 'expert',
};

/**
 * SPEC-G05 §5.3: a participant that is already on the board fades out in the
 * game page's read-only roster — the theme ring and avatar dim, the sequence
 * badge and clue stay legible.
 */
export const GAME_PLACED_OPACITY = 0.45;

// ---- Uploads ----
export const UPLOAD_MAX_SIZE = 2 * 1024 * 1024; // 2 MB
export const UPLOAD_ALLOWED_MIME = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
] as const;
export const THUMBNAIL_MAX_DIMENSION = 512;

// ---- Pagination ----
export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 12;
export const MAX_PAGE_SIZE = 100;

// ---- Routing ----
export const API_PREFIX = '/api';
export const FILES_ROUTE_PREFIX = `${API_PREFIX}/files`;

// ---- v0.5.3 FIX-N01 提示位置 / FIX-N11 UI 层叠 ----
/**
 * FIX-N01 (docs/v0.5.3.md §1): the toast stack's distance from the top edge.
 *
 * The console's header bar is `h-14` (56px) and the editor's toolbar is the
 * same height, so a top-right toast pinned to the edge covered 保存 / 发布 /
 * 导入 / 导出. 64px puts the first toast **below** the bar while keeping it on
 * the right — the side with the fewest controls.
 */
export const TOAST_OFFSET = 64;

/**
 * FIX-N11 (docs/v0.5.3.md §6.4): the stacking order of the editor's overlay
 * panels, in one place.
 *
 * The strips used to hard-code `z-30` while the info drawer hard-coded `z-20`
 * in a different file — so the ruler painted over the drawer. Values are
 * deliberately sparse (10 / 20 / 30) so a future layer has room to slot in.
 */
export const UI_Z = {
  /** 标尺条带 — always under every drawer. */
  ruler: 10,
  /** 方格信息框 / 谜题基本信息抽屉。 */
  infoDrawer: 20,
  /** 参与者信息框 — the top-most panel. */
  drawer: 30,
} as const;

// ---- Error codes (see docs/feature-1.0.md §4.5, docs/feature-0.2.md §5) ----
export const ErrorCode = {
  OK: 0,
  VALIDATION_FAILED: 40001,
  NOT_FOUND: 40004,
  CONFLICT: 40901,
  DRAFT_CONFLICT: 40902,
  REGION_OVERLAP: 40903,
  PUBLISH_VALIDATION_FAILED: 42201,
  FILE_TOO_LARGE: 41301,
  UNSUPPORTED_MEDIA_TYPE: 41501,
  INTERNAL_ERROR: 50000,
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

export const HTTP_STATUS_BY_ERROR_CODE: Record<ErrorCodeValue, number> = {
  [ErrorCode.OK]: 200,
  [ErrorCode.VALIDATION_FAILED]: 400,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.CONFLICT]: 409,
  [ErrorCode.DRAFT_CONFLICT]: 409,
  [ErrorCode.REGION_OVERLAP]: 409,
  [ErrorCode.PUBLISH_VALIDATION_FAILED]: 422,
  [ErrorCode.FILE_TOO_LARGE]: 413,
  [ErrorCode.UNSUPPORTED_MEDIA_TYPE]: 415,
  [ErrorCode.INTERNAL_ERROR]: 500,
};
