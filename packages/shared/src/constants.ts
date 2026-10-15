/**
 * Cross-package constants shared by server and web.
 * Keep this file free of runtime dependencies (types + plain values only).
 */

// ---- Canvas / grid ----
export const GRID_SIZE_MIN = 2;
export const GRID_SIZE_MAX = 24;
export const GRID_SIZE_DEFAULT = 6;

export const CELL_SIZE = 48;
export const GRID_LINE_COLOR = '#000000';
export const GRID_LINE_WIDTH = 2;
export const GRID_BORDER_WIDTH = 3;

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

// ---- Participant linkage (docs/v0.3.0.md FEAT-502, v0.3.3 MOD-801) ----
// MOD-801: click/touch trigger grouping is gone — linkages are a flat list.
export const PARTICIPANT_TARGET_TYPES = ['character', 'item', 'cell', 'region'] as const;
export const EFFECT_COLORS = ['red', 'blue'] as const;
export const EFFECT_COLOR_HEX: Record<(typeof EFFECT_COLORS)[number], string> = {
  red: '#EF4444',
  blue: '#3B82F6',
};
export const EFFECT_COLOR_LABELS: Record<(typeof EFFECT_COLORS)[number], string> = {
  red: '红',
  blue: '蓝',
};
/**
 * MOD-802 (docs/v0.3.3.md): region highlights are a fixed inner blue
 * border — the linkage's red/blue parameter does not apply to regions.
 */
export const REGION_HIGHLIGHT_BORDER_COLOR = '#3B82F6';
/** Width (px) of the region highlight border, inset from the region edge. */
export const REGION_HIGHLIGHT_BORDER_WIDTH = 2;
/** Inset (px) of the region highlight border from the region edge. */
export const REGION_HIGHLIGHT_BORDER_INSET = 2;
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

// ---- OPT-901 §1.2.1 当前方格辅助提示框 ----
/** Inner-line stroke when the hovered cell is free. */
export const CELL_CURSOR_COLOR = '#FFFFFF';
/** Inner-line stroke when the hovered cell holds a non-standable object. */
export const CELL_CURSOR_BLOCKED_COLOR = '#E57373';
/** Grey shadow that sits on top of the Border ring (§1.2.1). */
export const CELL_CURSOR_SHADOW_COLOR = 'rgba(0,0,0,0.15)';

// ---- OPT-901 §1.2.5 不可站立物体阴影 ----
export const NO_STAND_SHADOW_COLOR = 'rgba(0,0,0,0.08)';

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
