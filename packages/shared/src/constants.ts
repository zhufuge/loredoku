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

// ---- Asset（资源库：背景 / 物品两类图案） ----
// v0.6.0: 「物品」这个词让给了画布上的物件层，资源库改叫 assets；原来的
// `category` 换成 `type`，取值 `object` 改为 `item`。
export const ASSET_NAME_MAX_LENGTH = 100;
export const ASSET_CODE_MAX_LENGTH = 64;
export const ASSET_CODE_PATTERN = /^[A-Za-z0-9_]+$/;
export const ASSET_TYPES = ['background', 'item'] as const;
export const DEFAULT_ASSET_TYPE = 'item';
export const ASSET_TYPE_LABELS: Record<(typeof ASSET_TYPES)[number], string> = {
  background: '背景',
  item: '物品',
};
export const ASSET_FIT_MODES = ['cover', 'contain'] as const;
export const DEFAULT_ASSET_FIT_MODE = 'cover';
// v0.6.1: 形态（asset_variants，当时叫 asset_forms）—— 一个资源的多种「样子」。
// v0.7.6: 占格搬到「每次放置」上（恒 1 格），形态只管长相。
export const ASSET_VARIANT_NAME_MAX_LENGTH = 32;
export const DEFAULT_ASSET_VARIANT_NAME = '默认';

// ---- 历史迁移兼容常量（仅 v0.6.0 之前的迁移文件引用，值冻结为当时语义）----
// v0.6.0 把 `category` 改名为 `type`、取值 `object` 改成 `item`。历史迁移
// `...000008` / `...000009` 描述的是当时的表结构（`items.category` 默认 `'object'`），
// 逻辑一个字都不能改，所以这里保留旧名、冻结旧值。业务代码一律用 ASSET_*。
export const DEFAULT_ITEM_CATEGORY = 'object' as const;
export const DEFAULT_ITEM_FIT_MODE = 'cover' as const;

// ---- Editor layers ----
/** v0.6.0: the canvas layers are `background` and `item` (was `object`). */
export const EDITOR_LAYERS = ['background', 'item'] as const;

// Deprecated (v1 rotation no longer used; kept for legacy migration typings).
export const CARD_ROTATIONS = [0, 90, 180, 270] as const;

// ---- Region ----
export const REGION_NAME_MAX_LENGTH = 100;
export const REGION_DESCRIPTION_MAX_LENGTH = 500;
/**
 * 区域轮廓线线宽边界：与地图级缺省同一套，区域只能在区间内覆盖。
 *
 * v0.7.4：下限 4 → 1。原来的 4 只是为了让轮廓线比网格分隔线（2）粗一档，
 * 现在作者可以自己决定细到什么程度（线宽一律按 `cellSize / BASE_CELL` 缩放，
 * 1 在大格子上仍然看得见）。
 */
export const REGION_BORDER_WIDTH_MIN = 1;
export const REGION_BORDER_WIDTH_MAX = 12;
/** 区域轮廓线的地图级缺省颜色。 */
export const DEFAULT_REGION_COLOR = '#000000';
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

// ---- Appearance ----
// An asset / character renders as an uploaded image or a colour block (`bgColor`),
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
/**
 * v0.7.13 (docs/v0.7.13.md §11): a character's **default participant colour**
 * (`characters.color`). Distinct from `bgColor`: that one is how the character
 * *looks* as a colour block, this one is the 主题色 it hands to a roster slot
 * when it is 加入'd as a participant.
 *
 * `null` = no default, the slot keeps `DEFAULT_THEME_COLOR`. **白 = 未指定**
 * （§11.4）：取色器常驻，没有复选框，白色就是它显示「没指定」的那个颜色，
 * 于是白色不落库 —— 代价是一个角色无法要求「白色槽位」，而它本来也区分不出
 * 「指定白」和「没指定」。
 */
export const CHARACTER_COLOR_PATTERN = BG_COLOR_PATTERN;

// ---- MapEntry ----
export const MAP_NAME_MAX_LENGTH = 100;
export const MAP_DESCRIPTION_MAX_LENGTH = 500;
export const MAP_STATUSES = ['draft', 'published'] as const;
export const DEFAULT_MAP_STATUS = 'draft';
export const MAP_NOTE_MAX_LENGTH = 200;

// ---- Puzzle ----
// v0.5.0 FEAT-K08: the puzzle owns participants + the linkage-colour palette and
// only **references** a published map version (`PuzzleDraft.map`).
//
// v0.7.1 (docs/v0.7.1.md §5.3): v2 — `map` carries a **copy of the canvas**
// (`{ mapId, versionNo, mapName, data }`), so a puzzle can be published and
// frozen on its own. v1 payloads (reference only, no canvas) are still readable
// but cannot be imported: they have no board to render.
export const PUZZLE_JSON_VERSION = 2;
export const PUZZLE_NAME_MAX_LENGTH = 100;
export const PUZZLE_DESCRIPTION_MAX_LENGTH = 500;

// ---- v0.7.14 题面：全局线索与结束语 ----
/**
 * 全局线索**最多 8 条**（docs/v0.7.14.md §2）。
 *
 * 这个数字不是随手定的：题面纸片贴在画布左上角，玩家一边看盘一边扫它。
 * 八条已经是一屏能一眼扫完的上限（每条一行、行距 1.7，加描述合计约 300px），
 * 再多就得滚动 —— 一张需要滚动才能读完的线索表，会逼玩家把视线从盘面挪开
 * 去做「找线索」这件事。真要写第九条，说明这条线索该并进描述里。
 */
export const PUZZLE_CLUES_MAX_COUNT = 8;
/** 单条线索 120 字：够写两句条件，再长就不像线索、像段落。 */
export const PUZZLE_CLUE_MAX_LENGTH = 120;
/**
 * 结束语 200 字。它是**过关后的一句话**，不是后记 —— 弹窗只有 448px 宽，
 * 200 字已经占满八行。
 */
export const PUZZLE_ENDING_MAX_LENGTH = 200;

// ---- Map draft JSON ----
/**
 * v0.6.0: v4 — a cell's object layer is `item` (was `object`) and every asset
 * reference is `assetId` (was `itemId`). Schemas are `.strict()`, so a v3
 * payload is rejected on write and absorbed on read by
 * `service/mapDraftCompat.ts` (migration `20260101000025` has already
 * rewritten the stored rows).
 *
 * v0.5.0 FEAT-K14: v3 — no `characterSlots` and no `style.linkageColors` (both
 * moved to the puzzle). v2 added `style` (FEAT-D02); v1 stays valid because a
 * missing `style` resolves to `DEFAULT_MAP_STYLE`.
 *
 * v0.6.1: v5 — a canvas item anchor may carry `variantId`, pointing at one of the
 * asset's variants (docs/v0.6.1.md §6). The field is optional, so v4 payloads keep
 * validating and fall back to the asset's first variant.
 *
 * v0.6.1 (background variants): v6 — a background cell may carry `variantId` too, now
 * that a background asset may own several variants. Same deal: optional, and the
 * fallback is the asset's first variant.
 *
 * v0.7.0: v7 — a region's own display style moved off `color` / `borderWidth` /
 * `fillOpacity` onto `style`, a deep partial over the map-level defaults (the
 * fill is gone entirely). Schemas are `.strict()`, so a v6 region payload is
 * rejected on write and rewritten on read by migration `20260101000030`.
 *
 * v0.7.6: v8 — the anchor key `formId` became `variantId` (the table went
 * `asset_forms` → `asset_variants`). Only the key moved: `w` / `h` stay, because
 * they describe **this placement** rather than the variant, and old drafts keep
 * their multi-cell footprints. Migration `20260101000035` rewrites the key and
 * bumps the number.
 */
export const MAP_JSON_VERSION = 8;

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
/** v0.6.0: `item` became `asset` — a linkage points at a resource, not at a placed item. */
export const PARTICIPANT_TARGET_TYPES = ['character', 'asset', 'cell', 'region'] as const;
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

// ---- Map style ----
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

// ---- v0.7.4 区域标签字体（docs/v0.7.4.md §2） ----
/**
 * 区域标签用的字体。
 *
 * 草稿里存的是**字体名**（例如 `WenKai`、`霞鹜文楷`），不是 CSS 字符串：一份
 * 草稿会被导出 / 导入、被复制成版本快照，存一个名字意味着换机器、换字号都还是
 * 同一款字体；而拼好的 `font-family` 一进 JSON 就再也没法安全地和别的回退链
 * 合并。字体文件由前端自己带（`packages/web/src/assets/fonts/`），本包只认名字。
 *
 * 下面这几个 key 是**内置字族**：不需要任何字体文件，靠系统里同名字族 + 回退链
 * 兜住。它们仍然合法（老草稿里存的就是它们），但选择器现在主推具体字体。
 */
export const MAP_STYLE_FONT_FAMILY_KEYS = ['system', 'sans', 'serif', 'kai', 'mono'] as const;
export type MapStyleFontFamilyKey = (typeof MAP_STYLE_FONT_FAMILY_KEYS)[number];
export const MAP_STYLE_FONT_FAMILY_LABELS: Record<MapStyleFontFamilyKey, string> = {
  system: '系统默认',
  sans: '无衬线',
  serif: '衬线',
  kai: '楷体',
  mono: '等宽',
};
export const MAP_STYLE_FONT_FAMILY_STACKS: Record<MapStyleFontFamilyKey, string> = {
  system:
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
  sans: '"Helvetica Neue", Helvetica, Arial, "PingFang SC", "Microsoft YaHei", sans-serif',
  serif: 'Georgia, "Times New Roman", "Songti SC", SimSun, serif',
  kai: '"Kaiti SC", KaiTi, STKaiti, "Noto Serif SC", serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Courier New", monospace',
};
export const DEFAULT_REGION_LABEL_FONT_FAMILY = 'system';

/**
 * 字体名的长度与字符集。
 *
 * 宽到能装下 `Source Han Serif SC` / `LXGW WenKai` / `霞鹜文楷`，但把**引号、
 * 逗号、分号、圆括号**排除在外 —— 拼回退链时唯一能注入 CSS 的位置就是字体名，
 * 而回退链本身由 `fontFamilyStack` 加引号包住，名字里再出现引号就会把它撕开。
 */
export const MAP_STYLE_FONT_FAMILY_NAME_MAX_LENGTH = 64;
export const MAP_STYLE_FONT_FAMILY_NAME_PATTERN =
  /^[A-Za-z0-9\u4e00-\u9fff][A-Za-z0-9\u4e00-\u9fff ._-]*$/;

/** 读草稿 / 导入 JSON / 读下拉值时的唯一判定点。 */
export function isMapStyleFontFamilyName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAP_STYLE_FONT_FAMILY_NAME_MAX_LENGTH &&
    MAP_STYLE_FONT_FAMILY_NAME_PATTERN.test(value)
  );
}

/** 内置字族的 key（不是具体字体名）。 */
export function isMapStyleFontFamilyKey(value: unknown): value is MapStyleFontFamilyKey {
  return (
    typeof value === 'string' &&
    (MAP_STYLE_FONT_FAMILY_KEYS as readonly string[]).includes(value)
  );
}

/**
 * 字体名 → 可直接放进 `style.fontFamily` 的回退链。
 *
 * 内置 key 用自己的回退链；具体字体名被引号包住、后面再挂系统默认那一串 ——
 * 字体文件没加载出来（或草稿来自没带这款字体的构建）时，标签退回系统字体而不是
 * 变成浏览器默认的衬线体。非法名字一律回退系统默认，绝不透传。
 */
export function fontFamilyStack(name: string): string {
  if (isMapStyleFontFamilyKey(name)) return MAP_STYLE_FONT_FAMILY_STACKS[name];
  if (!isMapStyleFontFamilyName(name)) {
    return MAP_STYLE_FONT_FAMILY_STACKS[DEFAULT_REGION_LABEL_FONT_FAMILY];
  }
  return `"${name}", ${MAP_STYLE_FONT_FAMILY_STACKS.system}`;
}
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
/** v0.7.0: the hovered label keeps the idle stroke size by default. */
export const STYLE_DEFAULT_REGION_LABEL_HOVER_STROKE_WIDTH = 10;

// ---- v0.5.2 FEAT-M01: 虚拟列表 ----
/** Fixed row height (px) shared by the asset and character lists. */
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

// ---- OPT-A03 §3.1 + OPT-A06 §5.2 阻挡物品阴影 ----
/** Deepened from `rgba(0,0,0,0.08)` to make blocking cells readable. */
export const BLOCKING_SHADOW_COLOR = 'rgba(0,0,0,0.18)';
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
/** Hover tints the label blue and enlarges it; OPT-C04 keeps it above the 17px base. */
export const REGION_LABEL_HOVER_FONT_SIZE = 19;

// ---- OPT-C06 物品层内边距 ----
/** OPT-C06 (docs/v0.3.7.md §OPT-C06): item artwork is inset so it never touches the grid lines. */
export const ITEM_PADDING_BASE = 4;
export const ITEM_PADDING_MIN = 2;
export const ITEM_PADDING_MAX = 12;

// ---- OPT-902 §2.3 物品悬停 ----
/** The item image stretches upward by this many pixels while hovered. */
export const ITEM_HOVER_LIFT_PX = 4;
export const ITEM_HOVER_TRANSITION_MS = 120;

// ---- v0.7.13 物品名称提示（docs/v0.7.13.md §2） ----
/**
 * 悬停多久之后报出物品名称。
 *
 * 比全站 Tooltip 的 320ms 慢三倍多，这是**故意的**：墙面上的物品是按格密排的，
 * 320ms 会让扫过去一眼变成「提示雨」；而这里要回答的是「这个画的是什么东西」，
 * 是一个停下来的动作，不是在找按钮。1s 恰好把「路过」和「在看」分开。
 */
export const ITEM_NAME_TIP_DELAY_MS = 1000;

// ---- v0.7.5 物品展示变换（docs/v0.7.5.md §3） ----
/**
 * 已放置物品的**展示**变换：等比例缩放 + 按格偏移。
 *
 * 只影响画出来的那一块，不动脚位（`w` × `h`）—— 脚位是占格 / 擦除 / 碰撞的依据，
 * 展示是「这张图看起来多大、歪到哪儿」。两者分开，作者可以放大一幅装饰树而不
 * 让它变成 3×3 的占格物。
 *
 * 单位是**格**而不是像素：地图的 `cellSize` 可调，像素偏移换个格子大小就错位了。
 */
export const ITEM_SCALE_MIN = 0.25;
export const ITEM_SCALE_MAX = 4;
export const ITEM_SCALE_STEP = 0.05;
export const ITEM_OFFSET_MIN = -4;
export const ITEM_OFFSET_MAX = 4;
export const ITEM_OFFSET_STEP = 0.05;
export const DEFAULT_ITEM_SCALE = 1;
export const DEFAULT_ITEM_OFFSET = 0;

export interface ItemTransform {
  /** 相对脚位的等比例倍数，1 = 填满脚位。 */
  scale: number;
  /** 以格为单位的水平偏移，正数向右；可超出脚位。 */
  offsetX: number;
  /** 以格为单位的垂直偏移，正数向下。 */
  offsetY: number;
}

/** 变换的存储形状：与默认值相同的字段不写，缺键即默认。 */
export interface ItemTransformOverride {
  scale?: number;
  offsetX?: number;
  offsetY?: number;
}

const clampRound = (value: number | undefined, min: number, max: number, fallback: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const clamped = Math.min(max, Math.max(min, value));
  // 两位小数：`0.05` 的步长存成 `0.30000000000000004` 只会让草稿难读。
  return Math.round(clamped * 100) / 100;
};

/**
 * 缺键 / 手改 JSON / 老草稿的唯一收口：把三个字段夹到合法区间，缺省给默认值。
 *
 * 渲染与 store 都走这里，所以「画布上看到的」和「写回草稿的」永远是同一个数。
 */
export function resolveItemTransform(item?: ItemTransformOverride | null): ItemTransform {
  return {
    scale: clampRound(item?.scale, ITEM_SCALE_MIN, ITEM_SCALE_MAX, DEFAULT_ITEM_SCALE),
    offsetX: clampRound(item?.offsetX, ITEM_OFFSET_MIN, ITEM_OFFSET_MAX, DEFAULT_ITEM_OFFSET),
    offsetY: clampRound(item?.offsetY, ITEM_OFFSET_MIN, ITEM_OFFSET_MAX, DEFAULT_ITEM_OFFSET),
  };
}

/** 这个变换是不是恒等（`scale=1` 且不偏移）：是就不必写进草稿。 */
export function isIdentityItemTransform(transform: ItemTransform): boolean {
  return (
    transform.scale === DEFAULT_ITEM_SCALE &&
    transform.offsetX === DEFAULT_ITEM_OFFSET &&
    transform.offsetY === DEFAULT_ITEM_OFFSET
  );
}

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
/** Participant title bar height, kept in sync with the asset panel header. */
export const PARTICIPANT_HEADER_HEIGHT = 40;
/** Participant cell minimum height. */
export const PARTICIPANT_MIN_HEIGHT = 104;
/** Clue display area under the avatar (3 lines). */
export const PARTICIPANT_CLUE_HEIGHT = 72;
/** FEAT-O12 (docs/v0.5.4.md §6.1): height of the character name row between avatar and clue. */
export const PARTICIPANT_NAME_HEIGHT = 20;
/** Gap between participant cells. */
export const PARTICIPANT_CELL_GAP = 14;
/** Minimum avatar diameter. */
export const PARTICIPANT_AVATAR_MIN = 56;
/** The slot card's corner radius. The sequence badge rounds its top-left with it. */
export const PARTICIPANT_SLOT_RADIUS = 6;
/** OPT-B06 §6.3 + FEAT-O13 (docs/v0.5.4.md §6.2): sequence badge in the top-left corner, enlarged. */
export const PARTICIPANT_SEQ_SIZE = 20;
export const PARTICIPANT_SEQ_FONT_SIZE = 14;
export const PARTICIPANT_SEQ_COLOR = '#374151';
/** Translucent white so the badge stays readable on any theme colour. */
export const PARTICIPANT_SEQ_BACKGROUND = 'rgba(255,255,255,0.85)';
export const PARTICIPANT_SEQ_BORDER = '1px solid rgba(0,0,0,0.1)';
/**
 * FEAT-O13: no top / left edge of its own — the card's frame is those two
 * lines; only BR rounds. The top-left rounds with the **card's inner** radius:
 * the badge sits flush in the corner (inset 0), so a square corner there would
 * poke past the card's rounded frame.
 *
 * v0.7.14：TL 是 `卡片半径 − 描边`（6 − 1 = 5），不是卡片半径本身。
 * 徽标贴在**padding box** 的角上（`position:absolute; top/left: 0`，也就是描边
 * 内侧 1px），那一圈内圆角的半径比外圆角小 1px。徽标用外圆角时弧比内弧「切得
 * 更深」，两者之间露出一道月牙形的卡纸 —— 选中时徽标是主色、描边也是主色，
 * 中间那道纸白就像「高亮环和序号之间漏了缝」。
 */
export const PARTICIPANT_SEQ_BORDER_RADIUS = `${PARTICIPANT_SLOT_RADIUS - 1}px 0 6px 0`;
/** Kept for the callers that still inset the badge (0 = corner, see §6.2). */
export const PARTICIPANT_SEQ_INSET = 0;
/**
 * v0.6.4 (docs/v0.6.4.md §2): max length of a participant's configured 编号展示
 * text. The badge grows around its text, so the bound keeps a long label from
 * taking over the slot's corner.
 */
export const PARTICIPANT_DISPLAY_NUMBER_MAX = 6;
/**
 * v0.7.13 (docs/v0.7.13.md §11): `characters.display_name` — the 编号 a
 * character brings into a roster slot. Same bound as
 * {@link PARTICIPANT_DISPLAY_NUMBER_MAX} because it lands on the same badge;
 * the two must never drift apart or a saved default would be rejected on save.
 */
export const CHARACTER_DISPLAY_NAME_MAX = PARTICIPANT_DISPLAY_NUMBER_MAX;

// ---- v0.6.3 参与者布局（docs/v0.6.3.md §3） ----
/**
 * The horizontal padding around the slot matrix. It is a constant because the
 * panel's width is derived from the column count, so the padding has to be
 * part of the arithmetic — a Tailwind class drifting away from it would make
 * the panel 8px too narrow for its own content.
 */
export const ROSTER_PANEL_PADDING = 8;
/**
 * The width of the panel aside's own right border (the separator against the
 * canvas). The aside is `border-box`, so that 1px comes out of the width the
 * arithmetic computes — leaving it out makes the scroll container's content
 * box 1px narrower than the matrix, and a 1px overflow is enough to bring the
 * horizontal scrollbar back.
 */
export const ROSTER_PANEL_BORDER_WIDTH = 1;
/** The panel never goes below the width it had before it became resizable. */
export const ROSTER_PANEL_MIN_WIDTH = 256;
/** Past ROSTER_COLS_MAX the panel stops growing here and scrolls instead. */
export const ROSTER_PANEL_MAX_WIDTH = 512;
/**
 * v0.6.3: the widest column count the 基本信息 field accepts — and, at the
 * same time, the widest the panel still fits without a horizontal scrollbar.
 * A stored count above it (an import, or a puzzle authored before the cap)
 * keeps the capped-and-scrolling layout instead of pushing the canvas away.
 */
export const ROSTER_COLS_MAX = 6;

// ---- v0.3.8 FEAT-D02 地图基本信息（地图级缺省值） ----
/**
 * Map-level display constants edited by the 「地图基本信息」 drawer (FEAT-D02).
 * Everything here is a **default** — per-item settings still win. The one
 * exception is 区域轮廓线 colour, which is global (the region's own `color`
 * only drives the fill). SPEC-E01 renamed fields to the layer names:
 * `border` → `gridSeparator`, `regionBorder` → `regionOutline`, etc.
 */
export interface MapStyleLine {
  width: number;
  color: string;
}

export interface MapStyleMouseCursorBox extends MapStyleLine {
  /** Stroke colour over a cell whose item has `blocking === true`. */
  blockedColor: string;
  /** Ring drawn over the grid separator so the box stays readable. */
  shadowColor: string;
}

export interface MapStyleOperationCursorBox extends MapStyleLine {
  /** Distance from the cell edge — an Outline sits outside the grid line. */
  offset: number;
}

export interface MapStyleRegionLabel {
  /**
   * v0.7.4 (docs/v0.7.4.md §2): the label's typeface — a concrete font family
   * name (`WenKai`) or one of the built-in `MAP_STYLE_FONT_FAMILY_KEYS`.
   */
  fontFamily: string;
  fontSize: number;
  strokeWidth: number;
  color: string;
  strokeColor: string;
  hoverFontSize: number;
  hoverColor: string;
  hoverStrokeColor: string;
  /** v0.7.0 (docs/v0.7.0.md §4): the hovered label's stroke size. */
  hoverStrokeWidth: number;
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

// ---- v0.7.0 区域自有样式（docs/v0.7.0.md §4） ----
/**
 * 一条线的区域级覆盖：形状与它覆盖的地图级缺省相同（轮廓线线宽是整数，
 * 高亮线线宽可以是小数，边界由 zod 分别把守）。
 */
export type RegionLineStyle = MapStyleLine;

/** 区域标签的区域级覆盖：与 `MapStyleRegionLabel` 同字段。 */
export type RegionLabelStyle = MapStyleRegionLabel;

/** The resolved region style: the map-level defaults with the region's overrides merged in. */
export interface RegionStyle {
  outline: RegionLineStyle;
  highlight: RegionLineStyle;
  label: RegionLabelStyle;
}

/**
 * 区域样式的**存储变体**：对地图级缺省的深 partial，只记差异。渲染时
 * `resolveRegionStyle(地图级缺省, override)` 合成完整值；三者全等于缺省时
 * 整个 `style` 键不落盘（`regionStyleOverride` 助手负责这件事）。
 */
export interface RegionStyleOverride {
  outline?: Partial<RegionLineStyle>;
  highlight?: Partial<RegionLineStyle>;
  label?: Partial<RegionLabelStyle>;
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
    fontFamily: DEFAULT_REGION_LABEL_FONT_FAMILY,
    fontSize: STYLE_DEFAULT_REGION_LABEL_FONT_SIZE,
    strokeWidth: STYLE_DEFAULT_REGION_LABEL_STROKE_WIDTH,
    color: REGION_LABEL_COLOR,
    strokeColor: REGION_LABEL_STROKE_COLOR,
    hoverFontSize: STYLE_DEFAULT_REGION_LABEL_HOVER_FONT_SIZE,
    hoverColor: REGION_LABEL_COLOR,
    hoverStrokeColor: STYLE_DEFAULT_REGION_HIGHLIGHT_COLOR,
    hoverStrokeWidth: STYLE_DEFAULT_REGION_LABEL_HOVER_STROKE_WIDTH,
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

/**
 * FEAT-O01 (docs/v0.5.4.md §2): the badge is a **tint**, so cover + name stay the loudest thing.
 *
 * v0.7.8：值从 5 个写死的浅色 hex 换成 CSS 变量。原来是浅色专用 —— 深色界面里
 * 会跳出 5 块亮色补丁。变量的两套取值定义在 `web/src/index.css`（竹青 → 芽绿 →
 * 赭黄 → 柿橙 → 绛，一根单向热力坡，不是五个分类色）。调用处是内联 style，
 * 所以这里只能是 `var(...)` 字符串，不参与任何服务端逻辑。
 *
 * v0.7.13：外面必须补一层 `hsl(...)`。`index.css` 里存的是 HSL **三元组**
 * （`150 34% 92%`，与 `--background` 等所有 token 同一约定），而内联
 * `background-color: var(--difficulty-*-bg)` 展开后是 `background-color: 150 34% 92%`
 * —— 不是合法颜色值，浏览器整条丢弃，徽章就只剩文字、没有底色。`hsl()` 写在
 * 这里而不是变量里，是为了不破坏「三元组供 `hsl(var(--x) / <alpha>)` 复用」的约定。
 */
export const GAME_DIFFICULTY_COLORS: Record<(typeof GAME_DIFFICULTY_LEVELS)[number], string> = {
  veryEasy: 'hsl(var(--difficulty-very-easy-bg))',
  easy: 'hsl(var(--difficulty-easy-bg))',
  medium: 'hsl(var(--difficulty-medium-bg))',
  hard: 'hsl(var(--difficulty-hard-bg))',
  expert: 'hsl(var(--difficulty-expert-bg))',
};

/** FEAT-O01 §2.2: a tint needs a dark label — white on a tint was unreadable. */
export const GAME_DIFFICULTY_TEXT_COLORS: Record<
  (typeof GAME_DIFFICULTY_LEVELS)[number],
  string
> = {
  veryEasy: 'hsl(var(--difficulty-very-easy-fg))',
  easy: 'hsl(var(--difficulty-easy-fg))',
  medium: 'hsl(var(--difficulty-medium-fg))',
  hard: 'hsl(var(--difficulty-hard-fg))',
  expert: 'hsl(var(--difficulty-expert-fg))',
};

/** FEAT-G02: the default tier pre-selected in the deploy dialog. */
export const GAME_DIFFICULTY_DEFAULT: (typeof GAME_DIFFICULTY_LEVELS)[number] = 'medium';

/** FEAT-G02: game name bounds (same width as a map name). */
export const GAME_NAME_MAX_LENGTH = 100;

/** FEAT-G02: covers are the widest artwork in the app, so they get their own cap. */
export const GAME_COVER_MAX_DIMENSION = 960;

/** FEAT-H03 / OPT-H04: map covers share the 16:10 frame with game covers. */
export const MAP_COVER_ASPECT = 16 / 10;
/** FEAT-H03: stored map covers are capped like game covers. */
export const MAP_COVER_MAX_DIMENSION = 960;

/** v0.7.1 §7.5: puzzle covers reuse the map's frame and cap. */
export const PUZZLE_COVER_MAX_DIMENSION = 960;

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
/**
 * v0.7.11：长按进度环的**出场延迟**。
 *
 * 环此前在 pointerdown 的第一帧就画出来，于是「点一下放编号」也会闪一下环 ——
 * 单点根本不会长按，闪出来的环只是在说一件不会发生的事。延迟到 160ms 之后再
 * 挂载，单点（绝大多数点击都在 120ms 内抬手）就什么都看不见。
 *
 * 环因此只画**剩下的** `GAME_LONG_PRESS_MS - GAME_PRESS_RING_DELAY_MS`，
 * 画满的那一帧仍是动作发生的那一帧（见 `PressRing`）。
 */
export const GAME_PRESS_RING_DELAY_MS = 160;
/** SPEC-G04: the undo stack keeps at most this many placement steps. */
export const GAME_PLACEMENT_HISTORY_MAX = 200;

/** SPEC-G03: the toolbar / participant-placement modes are mutually exclusive. */
export const GAME_TOOL_MODES = ['forbidden', 'clearing'] as const;

// ---- v0.4.1 games (docs/v0.4.1.md §4 / §5) ----
/** OPT-W04: the access path is `puzzle-` + slugified name + `-` + slugified difficulty. */
export const GAME_SLUG_PREFIX = 'puzzle';
export const GAME_SLUG_MIN_LENGTH = 3;
/** Doubles as the DB column width of `games.slug`. */
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

/**
 * v0.6.4 (docs/v0.6.4.md §3): how much the touched / clicked participant's
 * avatar is magnified by on the board, so the player can see where that
 * participant currently sits. A modest scale keeps the avatar inside its
 * neighbourhood — it is a hint, not a zoom.
 */
export const GAME_ACTIVE_PARTICIPANT_AVATAR_SCALE = 1.3;
/**
 * v0.6.4 §3: the same magnification for that participant's 编号 glyphs. Only
 * the active participant's own numbers grow — a cell shared with other
 * participants keeps their glyphs at the normal size.
 */
export const GAME_ACTIVE_PARTICIPANT_NUMBER_SCALE = 1.5;

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
  /** 保存中蒙版 — covers every panel while the save request flies. */
  saveMask: 40,
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
