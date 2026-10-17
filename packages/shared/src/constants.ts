// Cross-package constants. Keep this file dependency-free (plain values only).
// Every decision reference (OPT-*/FEAT-*/SPEC-*) points at the doc that owns it.

// ---- Canvas / grid ----
export const GRID_SIZE_MIN = 2;
export const GRID_SIZE_MAX = 24;
export const GRID_SIZE_DEFAULT = 6;

/** OPT-A01 (docs/v0.3.5.md §1.1): cell width range; `MIN` is also the pre-measure fallback. */
export const MIN_CELL_SIZE = 90;
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
/** Region outline width range — the region's own `borderWidth` attribute. */
export const REGION_BORDER_WIDTH = 6;
/** OPT-B04 (docs/v0.3.6.md §4): the board frame never follows a region's custom `borderWidth`. */
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
// An item / character renders as an uploaded image or a colour block (`bgColor`),
// which needs no upload and can be activated straight away.
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
// v0.5.0 FEAT-K08: the puzzle owns participants + the linkage-colour palette and
// only **references** a published map version (`PuzzleDraft.map`).
export const PUZZLE_JSON_VERSION = 1;
export const PUZZLE_NAME_MAX_LENGTH = 100;
export const PUZZLE_DESCRIPTION_MAX_LENGTH = 500;

// ---- Map draft JSON ----
/**
 * v0.5.0 FEAT-K14: v3 — no `characterSlots` and no `style.linkageColors` (both
 * moved to the puzzle). Schemas are `.strict()`, so v2 is rejected on write and
 * absorbed on read by `service/mapDraftCompat.ts`. v2 added `style` (FEAT-D02);
 * v1 stays valid because a missing `style` resolves to `DEFAULT_MAP_STYLE`.
 */
export const MAP_JSON_VERSION = 3;

// ---- Trigger effects ----
export const EFFECT_TYPES = ['highlight', 'glow', 'blink', 'tooltip'] as const;

// ---- Highlight palette (OPT-A06, docs/v0.3.5.md §5.1) ----
/**
 * OPT-A06 §5.1 centralises the interaction colours (v0.3.5 softened the deep
 * `#E53935` / `#3B82F6` into this pale pair). Not covered, by design:
 * theme colours, region colours, item artwork, grid lines.
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
/** MOD-802 (docs/v0.3.3.md): region highlight is a fixed blue, the linkage red/blue does not apply. */
export const REGION_HIGHLIGHT_BORDER_COLOR = HIGHLIGHT_BLUE;
/** OPT-B01 (docs/v0.3.6.md §1.1): 2px → 4px, growing **inwards**. */
export const REGION_HIGHLIGHT_WIDTH = 4;
export const DEFAULT_THEME_COLOR = '#FFFFFF';
/**
 * MOD-801 (docs/v0.3.3.md §1.1.1): the v0.3.2 palette darkened ~12%, one deep
 * mist blue added, the near-duplicate teal dropped — 15 swatches, `#FFFFFF`
 * default.
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
 * The canvas layers, **top-most first**, numbered exactly as
 * 《画布图层优先级规范》 (`docs/layer-priority.md` §2) — the single authority.
 * Keys are that document's 代码常量 names (v0.3.9 SPEC-E01), so code, docs and
 * UI share one vocabulary. v0.4.0 SPEC-G01/G02 inserted the two game-only
 * layers between 区域标签 and 物件图层, renumbering the stack.
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

/** 区域填充 — a v0.2.5 leftover parked between 背景图层 and 背景高亮 (`layer-priority.md` §1). */
export const REGION_FILL_Z = MAP_LAYER_Z.backgroundLayer + 2;

// ---- Map style (v0.3.8 FEAT-D02) ----
/**
 * Map-level defaults edited by the 「地图基本信息」 drawer. Sizes are authored at
 * `BASE_CELL` and scaled by `cellSize / BASE_CELL` (OPT-B03), so one config reads
 * the same at `n = 2` and `n = 24`.
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
 * Defaults only. The older `BORDER_WIDTH` / `RULER_FONT_SIZE` … stay untouched
 * because `canvasMetrics` and its tests still read them; `DEFAULT_MAP_STYLE`
 * points at this set instead.
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
 * historical `EFFECT_COLORS` keys, so old drafts keep working. v0.5.0 moved it
 * onto the puzzle (`PuzzleDraft.linkageColors`); this is its default.
 */
export const DEFAULT_LINKAGE_COLORS = [
  { key: 'red', label: '红', color: HIGHLIGHT_RED },
  { key: 'blue', label: '蓝', color: HIGHLIGHT_BLUE },
] as const;


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
/** Distance from the cell edge (an Outline sits outside the Border). */
export const OPERATION_CURSOR_OUTLINE_OFFSET = 1;

// ---- OPT-A03 §3.1 + OPT-A06 §5.2 不可站立物体阴影 ----
/** Deepened from `rgba(0,0,0,0.08)` to make blocked cells readable. */
export const NO_STAND_SHADOW_COLOR = 'rgba(0,0,0,0.18)';
// OPT-C03: `noStandShadow` / `canvasFrame` have their own `MAP_LAYER_Z` entries;
// the old `NO_STAND_SHADOW_Z` / `CANVAS_FRAME_Z` aliases are gone.

// ---- 区域名称 ----
/** The outline is one notch thicker than v0.3.3 (3px → 4px). */
export const REGION_LABEL_STROKE_WIDTH = 4;
/** OPT-C04: 14 → 17px base (still multiplied by the OPT-B03 scale). */
export const REGION_LABEL_FONT_SIZE = 17;
export const REGION_LABEL_COLOR = '#FFFFFF';
export const REGION_LABEL_STROKE_COLOR = '#000000';

// ---- 区域悬停 ----
/** Hover tints the label blue and enlarges it (v0.3.5 §2.2); OPT-C04 keeps it above the 17px base. */
export const REGION_LABEL_HOVER_FONT_SIZE = 19;

// ---- OPT-C06 物件层内边距 ----
/** OPT-C06 (docs/v0.3.7.md §OPT-C06): object artwork is inset so it never touches the grid lines. */
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

// ---- OPT-B06 参与者区（docs/v0.3.6.md §6） ----
/** Minimum participant cell width; the height stays at the v0.3.5 value. */
export const PARTICIPANT_MIN_WIDTH = 110;
/** Participant title bar height, kept in sync with the item panel header. */
export const PARTICIPANT_HEADER_HEIGHT = 40;
/** Participant cell minimum height (v0.3.5 OPT-A02). */
export const PARTICIPANT_MIN_HEIGHT = 104;
/** Clue display area under the avatar (3 lines). */
export const PARTICIPANT_CLUE_HEIGHT = 72;
/** FEAT-O12 (docs/v0.5.4.md §6.1): height of the character name row between avatar and clue. */
export const PARTICIPANT_NAME_HEIGHT = 20;
/** Gap between participant cells. */
export const PARTICIPANT_CELL_GAP = 14;
/** Minimum avatar diameter (v0.3.5 OPT-A02). */
export const PARTICIPANT_AVATAR_MIN = 56;
/** OPT-B06 §6.3 + FEAT-O13 (docs/v0.5.4.md §6.2): sequence badge in the top-left corner, enlarged. */
export const PARTICIPANT_SEQ_SIZE = 20;
export const PARTICIPANT_SEQ_FONT_SIZE = 14;
export const PARTICIPANT_SEQ_COLOR = '#374151';
/** Translucent white so the badge stays readable on any theme colour. */
export const PARTICIPANT_SEQ_BACKGROUND = 'rgba(255,255,255,0.85)';
export const PARTICIPANT_SEQ_BORDER = '1px solid rgba(0,0,0,0.1)';
/** FEAT-O13: no top / left edge of its own — the card's frame is those two lines; only BR rounds. */
export const PARTICIPANT_SEQ_BORDER_RADIUS = '0 0 6px 0';
/** Kept for the callers that still inset the badge (0 = corner, see §6.2). */
export const PARTICIPANT_SEQ_INSET = 0;

// ---- v0.3.8 FEAT-D02 地图基本信息（地图级缺省值） ----
/**
 * Map-level display constants edited by the 「地图基本信息」 drawer (FEAT-D02).
 * Everything here is a **default** — per-object settings still win. The one
 * exception is 区域轮廓线 colour, which is global (the region's own `color`
 * only drives the fill). SPEC-E01 renamed fields to the layer names:
 * `border` → `gridSeparator`, `regionBorder` → `regionOutline`, etc.
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

/** Declared after every constant it reads, to avoid the temporal dead zone on import. */
export const DEFAULT_MAP_STYLE: MapStyle = {
  /** FEAT-D03: `null` means "whatever the first adaptive pass computed". */
  cellSize: null,
  // v0.5.2 SPEC-M07: geometric defaults come from the `STYLE_DEFAULT_*` set.
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
/** FEAT-G02: the five difficulty tiers — a green → red ramp outside the linkage palette. */
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

/** FEAT-O01 (docs/v0.5.4.md §2): the badge is a **tint**, so cover + name stay the loudest thing. */
export const GAME_DIFFICULTY_COLORS: Record<(typeof GAME_DIFFICULTY_LEVELS)[number], string> = {
  veryEasy: '#DCFCE7',
  easy: '#ECFCCB',
  medium: '#FEF9C3',
  hard: '#FFEDD5',
  expert: '#FEE2E2',
};

/** FEAT-O01 §2.2: a tint needs a dark label — white on `#FEF9C3` was unreadable. */
export const GAME_DIFFICULTY_TEXT_COLORS: Record<
  (typeof GAME_DIFFICULTY_LEVELS)[number],
  string
> = {
  veryEasy: '#166534',
  easy: '#3F6212',
  medium: '#854D0E',
  hard: '#9A3412',
  expert: '#991B1B',
};

/** FEAT-G02: the default tier pre-selected in the deploy dialog. */
export const GAME_DIFFICULTY_DEFAULT: (typeof GAME_DIFFICULTY_LEVELS)[number] = 'medium';

/** FEAT-G02: game name bounds (same width as a map project name). */
export const GAME_NAME_MAX_LENGTH = 100;

/** FEAT-G02: covers are the widest artwork in the app, so they get their own cap. */
export const GAME_COVER_MAX_DIMENSION = 960;

/** FEAT-H03 / OPT-H04: map covers share the 16:10 frame with game covers (v0.5.3 SPEC-N04 shows it square). */
export const MAP_COVER_ASPECT = 16 / 10;
/** FEAT-H03: stored map covers are capped like game covers. */
export const MAP_COVER_MAX_DIMENSION = 960;

/** SPEC-G01: a cell holds a 3×3 grid of participant numbers; number font is `cellSize / 4`. */
export const GAME_NUMBER_GRID = 3;
export const GAME_NUMBER_GRID_CELLS = GAME_NUMBER_GRID * GAME_NUMBER_GRID;
export const GAME_NUMBER_FONT_RATIO = 0.25;
export const GAME_NUMBER_STROKE_RATIO = 0.08;

/** SPEC-G01 §7.1: the forbidden `×`, as a fraction of the cell size. */
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
/** OPT-W04: the access path is `puzzle-` + slugified name + `-` + slugified difficulty. */
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

/** SPEC-G05 §5.3: an already-placed participant fades out in the read-only roster. */
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
 * FIX-N01 (docs/v0.5.3.md §1): the toast stack's distance from the top edge. The
 * header bar is `h-14` (56px), so 64px drops the first toast **below** it while
 * staying on the right — the side with the fewest controls.
 */
export const TOAST_OFFSET = 64;

/**
 * FIX-N11 (docs/v0.5.3.md §6.4): the editor's overlay stacking order, in one
 * place — the strips hard-coded `z-30` while the drawer hard-coded `z-20`, so the
 * ruler painted over it. Sparse (10 / 20 / 30) so a future layer can slot in.
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
