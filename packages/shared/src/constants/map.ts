import { MAX_CELL_SIZE, MIN_CELL_SIZE } from './grid';
import { HIGHLIGHT_BLUE, HIGHLIGHT_RED } from './highlight';

// 地图常量：入口行、草稿 JSON、初始样式与缺省值；index.ts 统一再导出。
export const MAP_NAME_MAX_LENGTH = 100;
export const MAP_DESCRIPTION_MAX_LENGTH = 500;
export const MAP_STATUSES = ['draft', 'published'] as const;
export const DEFAULT_MAP_STATUS = 'draft';
export const MAP_NOTE_MAX_LENGTH = 200;

// 谜题含参与者与联动调色板，只引用已发布的 map 版本；v2 载荷带画布副本，v1 无画布不可导入。
export const PUZZLE_JSON_VERSION = 2;
export const PUZZLE_NAME_MAX_LENGTH = 100;
export const PUZZLE_DESCRIPTION_MAX_LENGTH = 500;

/** 谜题编码用连字符（会进访问路径），资源/角色用下划线（只在 JSON 引用）；编码本身即路径合法段。 */
export const PUZZLE_CODE_MAX_LENGTH = 48;
export const PUZZLE_CODE_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// ---- 题面：全局线索与结束语 ----
/** 全局线索**最多 8 条**（docs/v0.7.14.md §2）。 这个数字不是随手定的：题面纸片贴在画布左上角，玩家一边看盘一边扫它。 八条已经是一屏能一眼扫完的上限（每条一行、行距 1.7，加描述合计约 300px）， 再多就得滚动 —— 一张需要滚动才能读完的线索表，会逼玩家把视线从盘面挪开去做「找线索」这件事。真要写第九条，说明这条线索该并进描述里。 */
export const PUZZLE_CLUES_MAX_COUNT = 8;
/** 单条线索 120 字：够写两句条件，再长就不像线索、像段落。 */
export const PUZZLE_CLUE_MAX_LENGTH = 120;
/** 结束语 200 字。它是**过关后的一句话**，不是后记 —— 弹窗只有 448px 宽， 200 字已经占满八行。 */
export const PUZZLE_ENDING_MAX_LENGTH = 200;

// ---- Map draft JSON ----
/**
 * 草稿**不含** `characterSlots` / `style.linkageColors`（属谜题）；`style` 可缺 → `DEFAULT_MAP_STYLE`。schema 是 `.strict()`：老版本载荷写入被拒、读取由 `service/mapDraftCompat.ts` 吸收（存量行已由迁移重写），改字段必须同时改版本号。
 */
export const MAP_JSON_VERSION = 8;

// ---- Trigger effects ----
export const EFFECT_TYPES = ['highlight', 'glow', 'blink', 'tooltip'] as const;

// ---- Participant linkage (docs/v0.3.0.md FEAT-502, v0.3.3 MOD-801) ----
// MOD-801: click/touch trigger grouping is gone — linkages are a flat list.
/** A linkage points at a resource (`asset`), not at a placed item. */
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
// 参与者主题色只由原生取色器与 hex 输入决定，没有预设色板 —— 留一张没人读的
// 色表只会让后来者以为「主题色只能从这几个里挑」。

// ---- Map style ----
/** Map-level defaults edited by the 「地图基本信息」 drawer. Sizes are authored at `BASE_CELL` and scaled by `cellSize / BASE_CELL` (OPT-B03), so one config reads the same at `n = 2` and `n = 24`. */
export const MAP_STYLE_LINE_WIDTH_MIN = 1;
export const MAP_STYLE_LINE_WIDTH_MAX = 12;
/** v0.9.1 §5：物品描边的宽度区间。**0 = 不描边**，也是出厂默认 —— 描边是可选强调，不是每张图都得有；真要加时 1 ~ 12 与线宽同一档手感。 */
export const MAP_STYLE_ITEM_OUTLINE_WIDTH_MIN = 0;
export const MAP_STYLE_ITEM_OUTLINE_WIDTH_MAX = 12;
/** 操作光标框的**外扩距离**，单位是**格的百分比**（`100` = 一格）—— 画布像素下同一份 `2` 在大格子上只往外扩一点点、在小格子上却几乎盖住邻格；用百分比， 框与格子的相对关系在任何格子大小下都一样。 */
export const MAP_STYLE_OPERATION_OFFSET_MIN = 0;
export const MAP_STYLE_OPERATION_OFFSET_MAX = 100;
export const MAP_STYLE_REGION_LABEL_FONT_MIN = 9;
export const MAP_STYLE_REGION_LABEL_FONT_MAX = 48;
export const MAP_STYLE_REGION_LABEL_STROKE_MIN = 0;
export const MAP_STYLE_REGION_LABEL_STROKE_MAX = 12;
/** 区域标签的位置偏移（画布像素，正负都收）。 偏移只要求是有限数字：上下限本是为了「别让标签跑没」，但标签推到画面外之后照样能从区域列表点回来，而作者想把标签推到远处、给整块区域留白时，这个限制先把路堵死了。web 侧的两处 clamp 只负责取整、不封顶。 */

// ---- v0.7.4 区域标签字体（docs/v0.7.4.md §2） ----
/**
 * 区域标签用的字体：草稿里存**字体名**（例如 `WenKai`、`霞鹜文楷`）而不是 CSS 字符串 —— 导出 / 导入、换机器都还是同一款；拼好的 `font-family` 进 JSON 就没法和别的回退链安全合并。内置字族 key 仍合法（老草稿里就是它们）。字体文件由前端自带，本包只认名字。
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

/** 字体名的长度与字符集。 宽到能装下 `Source Han Serif SC` / `LXGW WenKai` / `霞鹜文楷`，但把**引号、 逗号、分号、圆括号**排除在外 —— 拼回退链时唯一能注入 CSS 的位置就是字体名， 而回退链本身由 `fontFamilyStack` 加引号包住，名字里再出现引号就会把它撕开。 */
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

/** 字体名 → 可直接放进 `style.fontFamily` 的回退链。 内置 key 用自己的回退链；具体字体名被引号包住、后面再挂系统默认那一串 —— 字体文件没加载出来（或草稿来自没带这款字体的构建）时，标签退回系统字体而不是变成浏览器默认的衬线体。非法名字一律回退系统默认，绝不透传。 */
export function fontFamilyStack(name: string): string {
  if (isMapStyleFontFamilyKey(name)) return MAP_STYLE_FONT_FAMILY_STACKS[name];
  if (!isMapStyleFontFamilyName(name)) {
    return MAP_STYLE_FONT_FAMILY_STACKS[DEFAULT_REGION_LABEL_FONT_FAMILY];
  }
  return `"${name}", ${MAP_STYLE_FONT_FAMILY_STACKS.system}`;
}
/** Ruler text size and text→board gap. */
export const MAP_STYLE_RULER_FONT_MIN = 9;
export const MAP_STYLE_RULER_FONT_MAX = 32;
export const MAP_STYLE_RULER_GAP_MIN = 0;
export const MAP_STYLE_RULER_GAP_MAX = 32;
export const MAP_STYLE_CELL_SIZE_MIN = MIN_CELL_SIZE;
export const MAP_STYLE_CELL_SIZE_MAX = MAX_CELL_SIZE;

/** `#RRGGBB` — the only colour format the style accepts. */
export const MAP_STYLE_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

// ---- v0.5.2 SPEC-M07: 「基本信息」默认值（docs/v0.5.2.md §7.1）----
/** Defaults only. The older `BORDER_WIDTH` / `RULER_FONT_SIZE` … stay untouched because `canvasMetrics` and its tests still read them; `DEFAULT_MAP_STYLE` points at this set instead. */
export const STYLE_DEFAULT_RULER_FONT_SIZE = 24;
export const STYLE_DEFAULT_RULER_GAP = 24;
export const STYLE_DEFAULT_REGION_OUTLINE_WIDTH = 12;
export const STYLE_DEFAULT_REGION_HIGHLIGHT_WIDTH = 12;
/** §7: the region highlight line is the strong blue `#3b82f6`. */
export const STYLE_DEFAULT_REGION_HIGHLIGHT_COLOR = '#3B82F6';
export const STYLE_DEFAULT_CANVAS_FRAME_WIDTH = 12;
/**
 * v0.8.7 §6：画布这张纸的**投影** —— 向右下偏移、不带模糊的硬影，颜色取画布外框色（`style.canvasFrame.color`）再压一层透明度。它是**作品**的一部分，不走 `--shadow-paper` / `--shadow-lifted` 那几档随浅色 / 深色主题换的界面阴影。
 */
export const CANVAS_SHADOW_OFFSET_PERCENT = 30;
/** 固定透明度：阴影颜色只配 `#RRGGBB`，落成影子时统一压这一档。 */
export const CANVAS_SHADOW_ALPHA = 0.3;
/** 阴影偏移的可调区间。0 = 不投阴影。 单位是**格的百分比**（`100` = 一格）：出厂 `30` 在基准格子（120px）上正好是 36px，格子被自适应缩放时阴影跟着按比例走，不会在大图上显得像一条细缝、在小图上糊住棋盘。 */
export const MAP_STYLE_SHADOW_OFFSET_MIN = 0;
export const MAP_STYLE_SHADOW_OFFSET_MAX = 200;
export const STYLE_DEFAULT_GRID_SEPARATOR_WIDTH = 4;
export const STYLE_DEFAULT_MOUSE_CURSOR_WIDTH = 8;
export const STYLE_DEFAULT_OPERATION_CURSOR_WIDTH = 8;
export const STYLE_DEFAULT_REGION_LABEL_FONT_SIZE = 32;
export const STYLE_DEFAULT_REGION_LABEL_STROKE_WIDTH = 10;
/** §2: the hovered label must be **larger** than the idle one (32 → 36). */
export const STYLE_DEFAULT_REGION_LABEL_HOVER_FONT_SIZE = 36;
/** The hovered label keeps the idle stroke size by default. */
export const STYLE_DEFAULT_REGION_LABEL_HOVER_STROKE_WIDTH = 10;

// ---- FEAT-M01: 虚拟列表 ----
/** Fixed row height (px) shared by the asset and character lists. */
export const LIST_ROW_HEIGHT = 64;

/** Linkage palette bounds (FEAT-D04). */
export const LINKAGE_COLOR_MIN_COUNT = 2;
export const LINKAGE_COLOR_MAX_COUNT = 12;
export const LINKAGE_COLOR_KEY_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;
export const LINKAGE_COLOR_LABEL_MAX_LENGTH = 16;

/** FEAT-D04 §「默认至少有红蓝」: the shipped palette. `red` / `blue` are the historical `EFFECT_COLORS` keys, so old drafts keep working. v0.5.0 moved it onto the puzzle (`PuzzleDraft.linkageColors`); this is its default. */
export const DEFAULT_LINKAGE_COLORS = [
  { key: 'red', label: '红', color: HIGHLIGHT_RED },
  { key: 'blue', label: '蓝', color: HIGHLIGHT_BLUE },
] as const;

// ---- FEAT-D02 地图基本信息（地图级缺省值） ----
/**
 * Map-level display constants edited by the 「地图基本信息」 drawer (FEAT-D02)：全是**默认值**，逐项设置仍然优先。唯一例外是区域轮廓线颜色 —— 它是全局的（区域自己的 `color` 只决定填充）。
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
  /** 相对方格向外扩多少 —— 单位是**格的百分比**（`100` = 一格）：Outline 画在格子外面，所以这一项通常很小（出厂 `1`）。 */
  offset: number;
}

export interface MapStyleRegionLabel {
  /** v0.7.4 (docs/v0.7.4.md §2): the label's typeface — a concrete font family name (`WenKai`) or one of the built-in `MAP_STYLE_FONT_FAMILY_KEYS`. */
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
 * 区域标签的**位置偏移**（相对「格子上沿居中」这个锚点）；单位是**格的百分比**（`100` = 一格），`0` = 不偏移（出厂值）。同一格子在不同区域里可能被别的东西占着，所以它是**每块区域各自一份**，放在 `DraftRegion.style.label` 的覆盖里而不是地图级缺省。
 */
export interface RegionLabelOffset {
  x: number;
  y: number;
}

/** Ruler text size + the text→board gap. */
export interface MapStyleRuler {
  fontSize: number;
  gap: number;
  /** 列 / 行标尺的前缀符号，默认 `C` / `R`。 **只有主题在配**：符号是「这一套世界怎么念行与列」，与识别色、难度分级同一层， 同一主题下的几十张图不该各自填一遍。`mapStyleSchema` 同时给地图草稿与主题的 `data.style` 用着，所以字段留在这层接口里；但地图草稿里的旧值不参与渲染（`MapRulerStrips` 按 `themeCode` 查主题），保存时也会被剥掉。 */
  columnSymbol?: string;
  rowSymbol?: string;
}

/** 标尺符号的长度上限 —— 再长就不是「前缀」而是句子了。 */
export const MAP_STYLE_RULER_SYMBOL_MAX_LENGTH = 4;

/** 标尺行列符号的出厂值。 单独提出来是因为 `MapStyleRuler` 上这两个字段是**可选**的：它们只有主题配， 地图草稿里那份会被剥掉（`stripRulerSymbols`），所以读一份地图的风格时这两个键本来就可能是缺席的，任何兜底都该落回这里而不是各自写 `'C'` / `'R'`。 */
export const MAP_STYLE_RULER_DEFAULT_SYMBOLS = {
  columnSymbol: 'C',
  rowSymbol: 'R',
} as const;

/**
 * v0.9.1（docs/v0.9.1.md §2）：画布这张纸投下的影子 —— 偏移与颜色都进了风格（「地图基本信息」与主题缺省各改各的），透明度仍固定为 {@link CANVAS_SHADOW_ALPHA}（颜色只收 `#RRGGBB`，不开放 alpha）。
 */
export interface MapStyleCanvasShadow {
  /** 向右下偏移多少画布像素（随 `zoom` 缩放）。 */
  offset: number;
  /** 影子颜色（`#RRGGBB`），落成影子时压 {@link CANVAS_SHADOW_ALPHA} 透明度。 */
  color: string;
}

/** v0.9.1 §5（docs/v0.9.1.md §5）：地图上**物品**的描边。 沿物品图片的 alpha 画一圈剪影描边（不是矩形框），用来把物品从底纹里拔出来。 `width = 0` 是出厂默认 —— 不描边。 */
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
  /** 画布纸片的投影（偏移 + 颜色）。 */
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
