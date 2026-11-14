import { MAX_CELL_SIZE, MIN_CELL_SIZE } from './grid';
import { HIGHLIGHT_BLUE, HIGHLIGHT_RED } from './highlight';

// // 地图：入口行、草稿 JSON、初始样式、基本信息缺省值。
// v0.10.4：从 `constants.ts`（1324 行、287 个导出）按主题拆开。值、注释、次序一律
// 照搬 —— 只是把「谁在用」相近的那些放在一个文件里，改一处不必在一千行里翻。
// 对外仍是同一组名字：`constants/index.ts` 全部再导出，`@loredoku/shared` 不变。

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

/**
 * v0.8.5 §7：谜题编码。
 *
 * 与资源 / 角色的编码**故意不同字符集**：那两个用下划线（`hlm_big_tree`），因为
 * 它们只在 JSON 里被引用；这个用连字符，因为它会直接变成访问路径的中段
 * （`/play/puzzle-hlm-sishan`），而路径只认小写字母、数字与连字符。让编码本身
 * 就合法，部署时就不用再翻译一次 —— 「作者写的」和「地址里的」是同一个串。
 */
export const PUZZLE_CODE_MAX_LENGTH = 48;
export const PUZZLE_CODE_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

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
// v0.8.3：`THEME_COLOR_PALETTE`（v0.3.3 MOD-801 的 15 色板）已删除 —— 界面不再提供
// 调色板，参与者主题色只由原生取色器与 hex 输入决定。留一张没人读的色表只会让后来者
// 以为「主题色只能从这 15 个里挑」。

// ---- Map style ----
/**
 * Map-level defaults edited by the 「地图基本信息」 drawer. Sizes are authored at
 * `BASE_CELL` and scaled by `cellSize / BASE_CELL` (OPT-B03), so one config reads
 * the same at `n = 2` and `n = 24`.
 */
export const MAP_STYLE_LINE_WIDTH_MIN = 1;
export const MAP_STYLE_LINE_WIDTH_MAX = 12;
/**
 * v0.9.1 §5：物品描边的宽度区间。**0 = 不描边**，也是出厂默认 —— 描边是可选
 * 强调，不是每张图都得有；真要加时 1 ~ 12 与线宽同一档手感。
 */
export const MAP_STYLE_ITEM_OUTLINE_WIDTH_MIN = 0;
export const MAP_STYLE_ITEM_OUTLINE_WIDTH_MAX = 12;
/**
 * v0.10.7：操作光标框的**外扩距离**，单位是**格的百分比**（`100` = 一格）。
 *
 * 以前记的是画布像素：同一份 `2` 在大格子上只往外扩一点点、在小格子上却几乎盖住
 * 邻格。改成百分比后，框与格子的相对关系在任何格子大小下都一样。
 */
export const MAP_STYLE_OPERATION_OFFSET_MIN = 0;
export const MAP_STYLE_OPERATION_OFFSET_MAX = 100;
export const MAP_STYLE_REGION_LABEL_FONT_MIN = 9;
export const MAP_STYLE_REGION_LABEL_FONT_MAX = 48;
export const MAP_STYLE_REGION_LABEL_STROKE_MIN = 0;
export const MAP_STYLE_REGION_LABEL_STROKE_MAX = 12;
/**
 * v0.9.6：区域标签位置偏移（画布像素，正负都收）。
 *
 * v0.10.7：原本这里有一对 `REGION_LABEL_OFFSET_MIN/MAX = ∓200`，已经删掉 ——
 * 上下限本是为了「别让标签跑没」，但标签被推到画面外之后照样能从区域列表点回来，
 * 而作者想把标签推到远处、给整块区域留白时，这个限制先把路堵死了。现在偏移只
 * 要求是有限数字；web 侧的两处 clamp 只负责取整，不再封顶。
 */

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
/**
 * v0.8.7 §6：画布这张纸的**投影** —— 向右下偏移一段、不带模糊的硬影，颜色取
 * 画布外框色（`style.canvasFrame.color`）再压一层透明度。
 *
 * 它不走 `--shadow-paper` / `--shadow-lifted` 那三档界面阴影：那三档是暖色、随浅色 /
 * 深色主题换，而这张影子是**作品**的一部分（和画框、网格线一样，不随界面变）。
 * 偏移量是画布像素 —— 和其它线宽一样，跟着 `zoom` 缩放。
 *
 * 2026-11-09（docs/v0.9.0.md §16）：6 → **24**。首发那个 6px 实测只露出约 3px
 * —— 外框的 SVG 描边骑在画布边界上、以边界为中心画，外半边正好压掉 2.8px，
 * 影子几乎看不见。用户要「地图阴影再偏移 20px」，最终定为总偏移 24px。
 *
 * 2026-11-09（docs/v0.9.1.md §2）：24 → **36**，并且偏移量与颜色不再是常量 ——
 * 它们进了 `MapStyle.canvasShadow`（地图「基本信息」与主题缺省风格都能改）。
 * 下面这几个常量只剩「出厂默认值」与区间，`canvasShadowStyle` 读的是风格里的值。
 */
export const CANVAS_SHADOW_OFFSET_PERCENT = 30;
/** 固定透明度：阴影颜色只配 `#RRGGBB`，落成影子时统一压这一档。 */
export const CANVAS_SHADOW_ALPHA = 0.3;
/**
 * v0.9.1：阴影偏移的可调区间。0 = 不投阴影。
 *
 * v0.10.7 起单位是**格的百分比**（`100` = 一格）：出厂 `30` 在基准格子（120px）
 * 上正好是原来的 36px，格子被自适应缩放时阴影跟着按比例走，不会在大图上显得
 * 像一条细缝、在小图上糊住棋盘。
 */
export const MAP_STYLE_SHADOW_OFFSET_MIN = 0;
export const MAP_STYLE_SHADOW_OFFSET_MAX = 200;
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
  /**
   * 相对方格向外扩多少 —— 单位是**格的百分比**（`100` = 一格，v0.10.7 起；原先
   * 是画布像素）。Outline 画在格子外面，所以这一项通常很小（出厂 `1`）。
   */
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

/**
 * v0.9.6：区域标签的**位置偏移**（相对「格子上沿居中」这个锚点）。
 *
 * 锚点由 `labelCell` 决定，但同一个格子在不同区域里可能被别的东西占着 —— 一条
 * 只占两格的长区域、标签又压在桌沿上时，作者需要把它推开一点点。偏移是
 * **每块区域各自一份**，所以放在 `DraftRegion.style.label` 的覆盖里（而不是
 * 地图级缺省）：地图级的缺省偏移对一块区域合适，对另一块就不合适。
 *
 * 单位是**格的百分比**（`100` = 一格，v0.10.7 起）：「往右四分之一格」这种意图
 * 在任何格子大小下都落在同一个位置；以前记的是画布像素，同一份 `12` 在大格子上
 * 只挪一小截、在小格子上却能跨过一整格。`0` = 不偏移（出厂值）。
 */
export interface RegionLabelOffset {
  x: number;
  y: number;
}

/** v0.3.9 FEAT-E02: ruler text size + the text→board gap. */
export interface MapStyleRuler {
  fontSize: number;
  gap: number;
  /**
   * v0.10.8：列 / 行标尺的前缀符号，默认 `C` / `R`。
   *
   * 为什么可配：中文地图上「C1 R3」和「列1 行3」是两种完全不同的读法，而标尺是
   * 玩家定位格子的唯一参照。存在风格里而不是写死，主题就能统一自己的说法。
   */
  columnSymbol: string;
  rowSymbol: string;
}

/** v0.10.8：标尺符号的长度上限 —— 再长就不是「前缀」而是句子了。 */
export const MAP_STYLE_RULER_SYMBOL_MAX_LENGTH = 4;

/**
 * v0.9.1（docs/v0.9.1.md §2）：画布这张纸投下的影子。
 *
 * v0.8.7 §6 时它是两个常量（偏移 24px、颜色取外框色）。这一版把偏移与颜色
 * 都搬进风格，于是「地图基本信息」与主题的缺省风格都能各改各的；透明度仍
 * 固定为 {@link CANVAS_SHADOW_ALPHA}（颜色只收 `#RRGGBB`，不开放 alpha）。
 */
export interface MapStyleCanvasShadow {
  /** 向右下偏移多少画布像素（随 `zoom` 缩放）。 */
  offset: number;
  /** 影子颜色（`#RRGGBB`），落成影子时压 {@link CANVAS_SHADOW_ALPHA} 透明度。 */
  color: string;
}

/**
 * v0.9.1 §5（docs/v0.9.1.md §5）：地图上**物品**的描边。
 *
 * 沿物品图片的 alpha 画一圈剪影描边（不是矩形框），用来把物品从底纹里拔出来。
 * `width = 0` 是出厂默认 —— 不描边。
 */
export interface MapStyleItemOutline {
  /** 基准宽度（随方格尺寸等比缩放）；0 = 不描边。 */
  width: number;
  /** 描边颜色（`#RRGGBB`）。 */
  color: string;
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
  /** v0.9.1：画布纸片的投影（偏移 + 颜色）。 */
  canvasShadow: MapStyleCanvasShadow;
  /** v0.9.1 §5：物品的描边（默认宽度 0 = 不描边）。 */
  itemOutline: MapStyleItemOutline;
  gridSeparator: MapStyleLine;
  mouseCursorBox: MapStyleMouseCursorBox;
  operationCursorBox: MapStyleOperationCursorBox;
  regionLabel: MapStyleRegionLabel;
  regionOutline: MapStyleLine;
  regionHighlight: MapStyleLine;
  ruler: MapStyleRuler;
}
