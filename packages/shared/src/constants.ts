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

// ---- Participant linkage (docs/v0.3.0.md FEAT-502) ----
export const PARTICIPANT_TRIGGERS = ['click', 'touch'] as const;
export const PARTICIPANT_TARGET_TYPES = ['character', 'item', 'cell', 'region'] as const;
/** `blue` is reserved for the canvas highlight colour, theme colours may not use it. */
export const EFFECT_COLORS = ['red', 'blue'] as const;
export const EFFECT_COLOR_HEX: Record<(typeof EFFECT_COLORS)[number], string> = {
  red: '#EF4444',
  blue: '#3B82F6',
};
export const EFFECT_COLOR_LABELS: Record<(typeof EFFECT_COLORS)[number], string> = {
  red: '红',
  blue: '蓝',
};
export const DEFAULT_THEME_COLOR = '#FFFFFF';
/**
 * MOD-710 (docs/v0.3.2.md): the blue-hue restriction is removed.
 * The palette excludes high-luminance colours so participant boxes stay
 * readable on a light background, but deep blue (#1E40AF) is allowed as
 * a theme colour.
 */
export const THEME_COLOR_PALETTE = [
  '#FFFFFF',
  '#000000',
  '#6B7280',
  '#8B4513',
  '#C08B4F',
  '#DC2626',
  '#EA580C',
  '#CA8A04',
  '#16A34A',
  '#0D9488',
  '#7C3AED',
  '#DB2777',
  '#BE185D',
  '#1E40AF',
  '#0F766E',
] as const;
/**
 * High-luminance threshold (HSL L > 85%). Non-blocking front-end warning only.
 * (docs/v0.3.2.md MOD-710 §3.3)
 */
export const THEME_COLOR_HIGH_LUMINANCE = 0.85;
/** Click highlight duration: 3 seconds (docs/v0.3.2.md MOD-701). */
export const HIGHLIGHT_DURATION_CLICK_MS = 3000;
/** Touch highlight duration: 1 second (docs/v0.3.2.md MOD-701). */
export const HIGHLIGHT_DURATION_TOUCH_MS = 1000;
/** Kept for backward compatibility — alias of touch duration. */
export const HIGHLIGHT_DURATION_MS = HIGHLIGHT_DURATION_TOUCH_MS;

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
