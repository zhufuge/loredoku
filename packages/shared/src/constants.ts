/**
 * Cross-package constants shared by server and web.
 * Keep this file free of runtime dependencies (types + plain values only).
 */

// ---- Canvas / grid ----
export const GRID_SIZE_MIN = 3;
export const GRID_SIZE_MAX = 24;
export const GRID_SIZE_DEFAULT = 20;

export const CELL_SIZE = 48;
export const GRID_LINE_COLOR = '#E5E7EB';

// ---- Card ----
export const CARD_NAME_MAX_LENGTH = 100;
export const CARD_CODE_MAX_LENGTH = 64;
export const CARD_CODE_PATTERN = /^[A-Za-z0-9_]+$/;
export const CARD_ROTATIONS = [0, 90, 180, 270] as const;

// ---- Region ----
export const REGION_NAME_MAX_LENGTH = 100;
export const REGION_DESCRIPTION_MAX_LENGTH = 500;
export const REGION_BORDER_WIDTH_MIN = 1;
export const REGION_BORDER_WIDTH_MAX = 12;
export const REGION_BORDER_WIDTH_DEFAULT = 4;
export const REGION_FILL_OPACITY_MIN = 0;
export const REGION_FILL_OPACITY_MAX = 0.5;
export const REGION_FILL_OPACITY_DEFAULT = 0.08;
export const DEFAULT_REGION_COLOR = '#3B82F6';

// ---- Project ----
export const PROJECT_NAME_MAX_LENGTH = 100;
export const PROJECT_DESCRIPTION_MAX_LENGTH = 500;

// ---- Trigger effects ----
export const EFFECT_TYPES = ['highlight', 'glow', 'blink', 'tooltip'] as const;

// ---- Editor tools ----
export const EDITOR_TOOLS = ['select', 'region', 'eraser', 'pan'] as const;
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

// ---- Error codes (see docs/feature-1.0.md §4.5) ----
export const ErrorCode = {
  OK: 0,
  VALIDATION_FAILED: 40001,
  NOT_FOUND: 40004,
  CONFLICT: 40901,
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
  [ErrorCode.FILE_TOO_LARGE]: 413,
  [ErrorCode.UNSUPPORTED_MEDIA_TYPE]: 415,
  [ErrorCode.INTERNAL_ERROR]: 500,
};
