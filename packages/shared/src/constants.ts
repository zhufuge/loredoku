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
 * OPT-B03 (docs/v0.3.6.md §3.2): every line width and font size is authored
 * against this reference cell width and multiplied by `cellSize / BASE_CELL`.
 */
export const BASE_CELL = 120;
/** Guard rails so lines never vanish on small cells or bloat on big ones. */
export const LINE_WIDTH_MIN = 0.5;
export const LINE_WIDTH_MAX = 12;
export const FONT_SIZE_MIN = 9;
export const FONT_SIZE_MAX = 28;

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
export const INNER_LINE_WIDTH = 1;
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

// ---- Project ----
export const PROJECT_NAME_MAX_LENGTH = 100;
export const PROJECT_DESCRIPTION_MAX_LENGTH = 500;
export const PROJECT_STATUSES = ['draft', 'published'] as const;
export const DEFAULT_PROJECT_STATUS = 'draft';
export const PROJECT_NOTE_MAX_LENGTH = 200;

// ---- Map draft JSON ----
export const MAP_JSON_VERSION = 1;

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

// ---- Canvas layer stacking (docs/v0.3.4.md OPT-901 §1.1) ----
/**
 * OPT-901 (docs/v0.3.4.md §1.1): the canvas layers, listed **top-most first**
 * exactly as the spec numbers them. `MAP_LAYER_Z` turns that order into the
 * CSS `z-index` values used by the renderer (higher = closer to the viewer).
 */
export const MAP_LAYER_ORDER = [
  'cellCursor',
  'regionLabel',
  'object',
  'gridBorder',
  'regionEdge',
  'noStandShadow',
  'regionHighlight',
  'cellHighlight',
  'backgroundHighlight',
  'background',
  'emptyCell',
] as const;

export type MapLayerName = (typeof MAP_LAYER_ORDER)[number];

export const MAP_LAYER_Z: Record<MapLayerName, number> = {
  /** 1 当前方格辅助提示框 — always the top-most element (§1.2.1). */
  cellCursor: 44,
  /** 2 区域名称 */
  regionLabel: 42,
  /** 3 物体 — above the grid lines so items are never cut by them (§1.1). */
  object: 40,
  /** 4 边框（网格线 + 画布外边框） */
  gridBorder: 38,
  /** 5 区域边界线 — below the grid lines so the Border stays readable (§1.1). */
  regionEdge: 36,
  /** 6 不可站立物体阴影 */
  noStandShadow: 34,
  /** 7 区域高亮线 */
  regionHighlight: 32,
  /** 8 方块高亮 */
  cellHighlight: 30,
  /** 9 背景高亮 */
  backgroundHighlight: 28,
  /** 10 背景 */
  background: 20,
  /** 11 空方格（画布底色） */
  emptyCell: 10,
};

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
/**
 * §3.1/§3.3 restate the v0.3.4 mask placement: **above the object artwork,
 * clipped to the inside of the Border** — so the mask itself never covers the
 * Border ring. Since §1.1 puts 物体 (layer 3) above 边框 (layer 4), "above the
 * artwork" means one slot above `object`, not below `gridBorder`.
 */
export const NO_STAND_SHADOW_Z = MAP_LAYER_Z.object + 1;

/**
 * OPT-B04 §4.2: the board's outermost frame must not be covered by any item
 * or highlight layer, so it renders above them — just under the region
 * labels and the cursor boxes.
 */
export const CANVAS_FRAME_Z = MAP_LAYER_Z.regionLabel;

// ---- OPT-901 §1.2.2 区域名称 ----
/** v0.3.4 §1.2.2: the outline is one notch thicker than v0.3.3 (3px → 4px). */
export const REGION_LABEL_STROKE_WIDTH = 4;
export const REGION_LABEL_FONT_SIZE = 14;
export const REGION_LABEL_COLOR = '#FFFFFF';
export const REGION_LABEL_STROKE_COLOR = '#000000';

// ---- OPT-902 §2.2 区域悬停 ----
/** Hovering a region tints its label blue and enlarges it (§2.2). */
export const REGION_LABEL_HOVER_FONT_SIZE = 16;

// ---- OPT-902 §2.3 物品悬停 ----
/** The object image stretches upward by this many pixels while hovered. */
export const OBJECT_HOVER_LIFT_PX = 4;
export const OBJECT_HOVER_TRANSITION_MS = 120;

// ---- OPT-B05 标尺字符（docs/v0.3.6.md §5） ----
/** Ruler glyph base sizes; both are multiplied by the OPT-B03 `scale`. */
export const RULER_FONT_SIZE = 15;
/** The cell the operation box is pinned to gets the larger glyph (§5.3). */
export const RULER_FONT_SIZE_ACTIVE = 17;
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

// ---- Editor tools ----
export const EDITOR_TOOLS = ['select', 'region', 'character', 'eraser', 'pan'] as const;
export const MAX_HISTORY_STEPS = 50;

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
