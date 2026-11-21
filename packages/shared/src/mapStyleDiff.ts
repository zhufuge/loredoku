import type { MapStyle } from './constants';
import { MAP_STYLE_RULER_DEFAULT_SYMBOLS } from './constants';

/** v0.8.0（docs/v0.8.0.md §16.8 / §5 的 S3 快照式）：地图风格与主题缺省风格的差异 —— **只列不同的项**，分组用「地图基本信息」抽屉里的分区名，值按屏幕上的写法格式化（`1.5px`、`#2f2a24`、`自适应`）。 */

export type MapStyleDiffGroup = '网格' | '边框' | '物品' | '标签' | '光标';

export interface MapStyleDiffEntry {
  group: MapStyleDiffGroup;
  /** 字段路径，稳定键（测试与「逐项确认」都靠它，不靠中文标签）。 */
  key: string;
  /** 抽屉里的那一栏叫什么。 */
  label: string;
  /** 这张图的值。 */
  mapValue: string;
  /** 主题缺省的值。 */
  themeValue: string;
}

type StyleLeaf = string | number | null;

export interface FieldSpec {
  key: string;
  group: MapStyleDiffGroup;
  label: string;
  read: (style: MapStyle) => StyleLeaf;
  /** 值怎么显示。缺省 = `String(value)`。 */
  format?: (value: StyleLeaf) => string;
}

const px = (value: StyleLeaf): string => (value === null ? '自适应' : `${value}px`);
/** 偏移类字段按格的百分比显示（100% = 一格）。 */
const pc = (value: StyleLeaf): string => (value === null ? '—' : `${value}%`);
const raw = (value: StyleLeaf): string => (value === null ? '—' : String(value));

/** 字段表 —— **顺序即显示顺序**。新增一个 `MapStyle` 字段时在这里加一行，否则弹窗会悄悄漏掉它（漏掉比多一行更糟：作者会以为那一项相同）。 导出：概览页的「缺省风格」表单要按同一份顺序与同一套中文名列出这二十几项 —— 两份表迟早会漂。`web` 那边只额外带一个「怎么写回去」的表， 标签与顺序仍然只有这里一份。 */
export const MAP_STYLE_FIELDS: readonly FieldSpec[] = [
  // 网格
  { key: 'cellSize', group: '网格', label: '方格大小', read: (style) => style.cellSize, format: px },
  { key: 'gridSeparator.width', group: '网格', label: '网格分隔线线宽', read: (style) => style.gridSeparator.width, format: px },
  { key: 'gridSeparator.color', group: '网格', label: '网格分隔线颜色', read: (style) => style.gridSeparator.color, format: raw },

  // 边框
  { key: 'canvasFrame.width', group: '边框', label: '画布外框线宽', read: (style) => style.canvasFrame.width, format: px },
  { key: 'canvasFrame.color', group: '边框', label: '画布外框颜色', read: (style) => style.canvasFrame.color, format: raw },
  // 画布阴影独立成两项：偏移与颜色各自可改，也各自参与比对。
  { key: 'canvasShadow.offset', group: '边框', label: '画布阴影偏移', read: (style) => style.canvasShadow.offset, format: pc },
  { key: 'canvasShadow.color', group: '边框', label: '画布阴影颜色', read: (style) => style.canvasShadow.color, format: raw },
  { key: 'regionOutline.width', group: '边框', label: '区域轮廓线线宽', read: (style) => style.regionOutline.width, format: px },
  { key: 'regionOutline.color', group: '边框', label: '区域轮廓线颜色', read: (style) => style.regionOutline.color, format: raw },
  { key: 'regionHighlight.width', group: '边框', label: '区域高亮线线宽', read: (style) => style.regionHighlight.width, format: px },
  { key: 'regionHighlight.color', group: '边框', label: '区域高亮线颜色', read: (style) => style.regionHighlight.color, format: raw },

  // 物品（v0.9.1 §5）
  { key: 'itemOutline.width', group: '物品', label: '物品描边宽度', read: (style) => style.itemOutline.width, format: px },
  { key: 'itemOutline.color', group: '物品', label: '物品描边颜色', read: (style) => style.itemOutline.color, format: raw },

  // 标签
  { key: 'regionLabel.fontFamily', group: '标签', label: '标签字体', read: (style) => style.regionLabel.fontFamily, format: raw },
  { key: 'regionLabel.fontSize', group: '标签', label: '标签字号', read: (style) => style.regionLabel.fontSize, format: px },
  { key: 'regionLabel.color', group: '标签', label: '标签颜色', read: (style) => style.regionLabel.color, format: raw },
  { key: 'regionLabel.strokeWidth', group: '标签', label: '标签描边粗细', read: (style) => style.regionLabel.strokeWidth, format: px },
  { key: 'regionLabel.strokeColor', group: '标签', label: '标签描边颜色', read: (style) => style.regionLabel.strokeColor, format: raw },
  { key: 'regionLabel.hoverFontSize', group: '标签', label: '悬停字号', read: (style) => style.regionLabel.hoverFontSize, format: px },
  { key: 'regionLabel.hoverColor', group: '标签', label: '悬停颜色', read: (style) => style.regionLabel.hoverColor, format: raw },
  { key: 'regionLabel.hoverStrokeWidth', group: '标签', label: '悬停描边粗细', read: (style) => style.regionLabel.hoverStrokeWidth, format: px },
  { key: 'regionLabel.hoverStrokeColor', group: '标签', label: '悬停描边颜色', read: (style) => style.regionLabel.hoverStrokeColor, format: raw },
  { key: 'ruler.fontSize', group: '标签', label: '标尺字号', read: (style) => style.ruler.fontSize, format: px },
  { key: 'ruler.gap', group: '标签', label: '标尺到地图的间距', read: (style) => style.ruler.gap, format: px },
  {
    key: 'ruler.columnSymbol',
    group: '标签',
    label: '列标尺符号',
    read: (style) => style.ruler.columnSymbol ?? MAP_STYLE_RULER_DEFAULT_SYMBOLS.columnSymbol,
    format: raw,
  },
  {
    key: 'ruler.rowSymbol',
    group: '标签',
    label: '行标尺符号',
    read: (style) => style.ruler.rowSymbol ?? MAP_STYLE_RULER_DEFAULT_SYMBOLS.rowSymbol,
    format: raw,
  },

  // 光标
  { key: 'mouseCursorBox.width', group: '光标', label: '鼠标光标框线宽', read: (style) => style.mouseCursorBox.width, format: px },
  { key: 'mouseCursorBox.color', group: '光标', label: '鼠标光标框颜色', read: (style) => style.mouseCursorBox.color, format: raw },
  { key: 'mouseCursorBox.blockedColor', group: '光标', label: '阻挡色', read: (style) => style.mouseCursorBox.blockedColor, format: raw },
  { key: 'mouseCursorBox.shadowColor', group: '光标', label: '阴影环颜色', read: (style) => style.mouseCursorBox.shadowColor, format: raw },
  { key: 'operationCursorBox.width', group: '光标', label: '操作光标框线宽', read: (style) => style.operationCursorBox.width, format: px },
  { key: 'operationCursorBox.color', group: '光标', label: '操作光标框颜色', read: (style) => style.operationCursorBox.color, format: raw },
  { key: 'operationCursorBox.offset', group: '光标', label: '操作光标框外扩距离', read: (style) => style.operationCursorBox.offset, format: pc },
];

/** 显示顺序也固定下来 —— 差异弹窗的分组顺序不该随字段表顺序漂移。 */
export const MAP_STYLE_DIFF_GROUPS: readonly MapStyleDiffGroup[] = ['网格', '边框', '物品', '标签', '光标'];

/** 两张风格之间有哪几项不一样。`theme` 为 `undefined`（主题还没设缺省风格）时返回空数组 —— 那时候「差几项」是个没有意义的问题，界面该问的是「要不要把这张图设成主题的缺省」。 */
export function diffMapStyle(
  map: MapStyle | undefined,
  theme: MapStyle | undefined,
): MapStyleDiffEntry[] {
  if (!map || !theme) return [];
  const diffs: MapStyleDiffEntry[] = [];
  for (const field of MAP_STYLE_FIELDS) {
    const mapValue = field.read(map);
    const themeValue = field.read(theme);
    if (mapValue === themeValue) continue;
    const format = field.format ?? raw;
    diffs.push({
      group: field.group,
      key: field.key,
      label: field.label,
      mapValue: format(mapValue),
      themeValue: format(themeValue),
    });
  }
  return diffs;
}
