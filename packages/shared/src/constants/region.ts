import {
  CELL_CURSOR_BLOCKED_COLOR,
  CELL_CURSOR_COLOR,
  CELL_CURSOR_SHADOW_COLOR,
  LINE_COLOR,
  OPERATION_CURSOR_COLOR,
  OPERATION_CURSOR_OUTLINE_OFFSET,
} from './grid';
import {
  CANVAS_SHADOW_OFFSET_PERCENT,
  DEFAULT_REGION_LABEL_FONT_FAMILY,
  MAP_STYLE_ITEM_OUTLINE_WIDTH_MIN,
  STYLE_DEFAULT_CANVAS_FRAME_WIDTH,
  STYLE_DEFAULT_GRID_SEPARATOR_WIDTH,
  STYLE_DEFAULT_MOUSE_CURSOR_WIDTH,
  STYLE_DEFAULT_OPERATION_CURSOR_WIDTH,
  STYLE_DEFAULT_REGION_HIGHLIGHT_COLOR,
  STYLE_DEFAULT_REGION_HIGHLIGHT_WIDTH,
  STYLE_DEFAULT_REGION_LABEL_FONT_SIZE,
  STYLE_DEFAULT_REGION_LABEL_HOVER_FONT_SIZE,
  STYLE_DEFAULT_REGION_LABEL_HOVER_STROKE_WIDTH,
  STYLE_DEFAULT_REGION_LABEL_STROKE_WIDTH,
  STYLE_DEFAULT_REGION_OUTLINE_WIDTH,
  STYLE_DEFAULT_RULER_FONT_SIZE,
  STYLE_DEFAULT_RULER_GAP,
  type MapStyle,
  type MapStyleLine,
  type MapStyleRegionLabel,
  type RegionLabelOffset,
} from './map';

// // 区域：命名、颜色、自有样式（描边 / 标签）。
// v0.10.4：从 `constants.ts`（1324 行、287 个导出）按主题拆开。值、注释、次序一律
// 照搬 —— 只是把「谁在用」相近的那些放在一个文件里，改一处不必在一千行里翻。
// 对外仍是同一组名字：`constants/index.ts` 全部再导出，`@loredoku/shared` 不变。

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

// ---- v0.7.0 区域自有样式（docs/v0.7.0.md §4） ----
/**
 * 一条线的区域级覆盖：形状与它覆盖的地图级缺省相同（轮廓线线宽是整数，
 * 高亮线线宽可以是小数，边界由 zod 分别把守）。
 */
export type RegionLineStyle = MapStyleLine;

/** 区域标签的区域级覆盖：与 `MapStyleRegionLabel` 同字段。 */
export type RegionLabelStyle = MapStyleRegionLabel;

/**
 * The resolved region style: the map-level defaults with the region's overrides merged in.
 *
 * v0.9.6：`labelOffset` 挂在**这一层**而不是 `label` 里面 —— 它只在区域级存在，
 * 地图级没有对应项。挂进来的话 `RegionLabelStyle`（= `MapStyleRegionLabel`）就
 * 得为它加一个地图级永远没有的字段，`DEFAULT_MAP_STYLE` 与两处共用编辑器都会
 * 被牵连。放在这里则只多一份「这块区域的标签往哪偏」，读点也直白。
 */
export interface RegionStyle {
  outline: RegionLineStyle;
  highlight: RegionLineStyle;
  label: RegionLabelStyle;
  /** v0.9.6：区域标签的位置偏移（画布像素）。缺省 `{ x: 0, y: 0 }`。 */
  labelOffset: RegionLabelOffset;
}

/**
 * 区域样式的**存储变体**：对地图级缺省的深 partial，只记差异。渲染时
 * `resolveRegionStyle(地图级缺省, override)` 合成完整值；三者全等于缺省时
 * 整个 `style` 键不落盘（`regionStyleOverride` 助手负责这件事）。
 *
 * v0.9.6：`label.offset` 与 `label` 其它字段同一条规矩 —— 只有非 0 的那一轴
 * 才记，两轴都 0 时整块 `offset` 不落盘。
 */
export interface RegionStyleOverride {
  outline?: Partial<RegionLineStyle>;
  highlight?: Partial<RegionLineStyle>;
  label?: Partial<RegionLabelStyle> & { offset?: Partial<RegionLabelOffset> };
}

/** Declared after every constant it reads, to avoid the temporal dead zone on import. */
export const DEFAULT_MAP_STYLE: MapStyle = {
  /** FEAT-D03: `null` means "whatever the first adaptive pass computed". */
  cellSize: null,
  // v0.5.2 SPEC-M07: geometric defaults come from the `STYLE_DEFAULT_*` set.
  canvasFrame: { width: STYLE_DEFAULT_CANVAS_FRAME_WIDTH, color: LINE_COLOR },
  // v0.9.1：出厂 30%（基准格子 120px 上 = 原来的 36px），颜色沿用外框的墨色，透明度由渲染层固定为 0.3。
  canvasShadow: { offset: CANVAS_SHADOW_OFFSET_PERCENT, color: LINE_COLOR },
  // v0.9.1 §5：默认不描边；颜色先给墨色，作者打开描边时不用先去改颜色。
  itemOutline: { width: MAP_STYLE_ITEM_OUTLINE_WIDTH_MIN, color: LINE_COLOR },
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
