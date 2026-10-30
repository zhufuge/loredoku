import {
  MAP_STYLE_CELL_SIZE_MAX,
  MAP_STYLE_LINE_WIDTH_MAX,
  MAP_STYLE_LINE_WIDTH_MIN,
  MAP_STYLE_CELL_SIZE_MIN,
  MAP_STYLE_FIELDS,
  MAP_STYLE_OPERATION_OFFSET_MAX,
  MAP_STYLE_OPERATION_OFFSET_MIN,
  MAP_STYLE_REGION_LABEL_FONT_MAX,
  MAP_STYLE_REGION_LABEL_FONT_MIN,
  MAP_STYLE_REGION_LABEL_STROKE_MAX,
  MAP_STYLE_REGION_LABEL_STROKE_MIN,
  MAP_STYLE_RULER_FONT_MAX,
  MAP_STYLE_RULER_FONT_MIN,
  MAP_STYLE_RULER_GAP_MAX,
  MAP_STYLE_RULER_GAP_MIN,
  REGION_BORDER_WIDTH_MAX,
  REGION_BORDER_WIDTH_MIN,
  mapStyleSchema,
  type MapStyle,
} from '@loredoku/shared';

/**
 * v0.8.3（docs/v0.8.3.md §2）—— 概览页「缺省风格」表单的字段表。
 *
 * **标签与顺序不在这里**：那是 `MAP_STYLE_FIELDS`（`shared/mapStyleDiff.ts`）的
 * 活儿 —— 差异弹窗已经按它列了二十几项，概览页再抄一份，两份迟早会漂。这里只补
 * 一件那边没有的信息：**怎么改回去**（控件类型与区间）。
 *
 * 于是「显示什么」和「怎么改」严格同一个集合：`MAP_STYLE_FIELDS` 里多一项而这里
 * 没跟，`THEME_STYLE_FIELDS` 会带上 `kind: 'unknown'`，`themeStyleFields.test.ts`
 * 直接失败 —— 而不是在界面上悄悄少一行。
 */

export type ThemeStyleFieldKind = 'number' | 'color' | 'shadow' | 'text' | 'unknown';

interface WriteSpec {
  kind: Exclude<ThemeStyleFieldKind, 'unknown'>;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}

/**
 * 线宽的上下界是同一组（1 ~ 12），字体与间距各有各的；颜色一律走取色控件，
 * 只有阴影环例外 —— 它允许 `rgba()`（`MAP_STYLE_SHADOW_PATTERN`），取色器给不出
 * 带透明度的值。
 */
const WRITE_SPECS: Record<string, WriteSpec> = {
  cellSize: { kind: 'number', min: MAP_STYLE_CELL_SIZE_MIN, max: MAP_STYLE_CELL_SIZE_MAX, suffix: 'px' },

  'gridSeparator.width': { kind: 'number', min: MAP_STYLE_LINE_WIDTH_MIN, max: MAP_STYLE_LINE_WIDTH_MAX, suffix: 'px' },
  'gridSeparator.color': { kind: 'color' },

  'canvasFrame.width': { kind: 'number', min: MAP_STYLE_LINE_WIDTH_MIN, max: MAP_STYLE_LINE_WIDTH_MAX, suffix: 'px' },
  'canvasFrame.color': { kind: 'color' },
  'regionOutline.width': { kind: 'number', min: REGION_BORDER_WIDTH_MIN, max: REGION_BORDER_WIDTH_MAX, suffix: 'px' },
  'regionOutline.color': { kind: 'color' },
  'regionHighlight.width': { kind: 'number', min: MAP_STYLE_LINE_WIDTH_MIN, max: MAP_STYLE_LINE_WIDTH_MAX, step: 0.5, suffix: 'px' },
  'regionHighlight.color': { kind: 'color' },

  'regionLabel.fontFamily': { kind: 'text' },
  'regionLabel.fontSize': { kind: 'number', min: MAP_STYLE_REGION_LABEL_FONT_MIN, max: MAP_STYLE_REGION_LABEL_FONT_MAX, suffix: 'px' },
  'regionLabel.color': { kind: 'color' },
  'regionLabel.strokeWidth': { kind: 'number', min: MAP_STYLE_REGION_LABEL_STROKE_MIN, max: MAP_STYLE_REGION_LABEL_STROKE_MAX, step: 0.5, suffix: 'px' },
  'regionLabel.strokeColor': { kind: 'color' },
  'regionLabel.hoverFontSize': { kind: 'number', min: MAP_STYLE_REGION_LABEL_FONT_MIN, max: MAP_STYLE_REGION_LABEL_FONT_MAX, suffix: 'px' },
  'regionLabel.hoverColor': { kind: 'color' },
  'regionLabel.hoverStrokeWidth': { kind: 'number', min: MAP_STYLE_REGION_LABEL_STROKE_MIN, max: MAP_STYLE_REGION_LABEL_STROKE_MAX, step: 0.5, suffix: 'px' },
  'regionLabel.hoverStrokeColor': { kind: 'color' },
  'ruler.fontSize': { kind: 'number', min: MAP_STYLE_RULER_FONT_MIN, max: MAP_STYLE_RULER_FONT_MAX, suffix: 'px' },
  'ruler.gap': { kind: 'number', min: MAP_STYLE_RULER_GAP_MIN, max: MAP_STYLE_RULER_GAP_MAX, suffix: 'px' },

  'mouseCursorBox.width': { kind: 'number', min: MAP_STYLE_LINE_WIDTH_MIN, max: MAP_STYLE_LINE_WIDTH_MAX, suffix: 'px' },
  'mouseCursorBox.color': { kind: 'color' },
  'mouseCursorBox.blockedColor': { kind: 'color' },
  'mouseCursorBox.shadowColor': { kind: 'shadow' },
  'operationCursorBox.width': { kind: 'number', min: MAP_STYLE_LINE_WIDTH_MIN, max: MAP_STYLE_LINE_WIDTH_MAX, suffix: 'px' },
  'operationCursorBox.color': { kind: 'color' },
  'operationCursorBox.offset': { kind: 'number', min: MAP_STYLE_OPERATION_OFFSET_MIN, max: MAP_STYLE_OPERATION_OFFSET_MAX, suffix: 'px' },
};

export interface ThemeStyleField {
  key: string;
  group: string;
  label: string;
  kind: ThemeStyleFieldKind;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  /** 当前值格式化后的样子（`1.5px` / `#2f2a24` / `自适应`），与差异弹窗同一套写法。 */
  format: (style: MapStyle) => string;
  /** 原始值 —— 表单控件要的是它，不是格式化后的字符串。 */
  read: (style: MapStyle) => string | number | null;
}

export const THEME_STYLE_FIELDS: readonly ThemeStyleField[] = MAP_STYLE_FIELDS.map((field) => {
  const spec = WRITE_SPECS[field.key];
  return {
    key: field.key,
    group: field.group,
    label: field.label,
    kind: spec?.kind ?? 'unknown',
    min: spec?.min,
    max: spec?.max,
    step: spec?.step,
    suffix: spec?.suffix,
    read: field.read,
    format: (style: MapStyle) => (field.format ?? String)(field.read(style)),
  };
});

/**
 * 写回一个值，返回**新的** `MapStyle`。
 *
 * 走「深拷贝 + 按路径写」而不是 27 个手写展开：路径就是 `MAP_STYLE_FIELDS` 里的
 * key，两者永远对得上；手写展开则每个字段都要记得把三层对象都铺开，漏一层就会
 * 把兄弟字段抹掉（那份代码在这仓里已经出现过一次）。
 *
 * `MapStyle` 是纯 JSON，`JSON.parse(JSON.stringify())` 足够，也不必担心 structuredClone
 * 在旧 jsdom 里缺席。
 */
export function writeStyleValue(
  style: MapStyle,
  key: string,
  value: string | number | null,
): MapStyle {
  const next = JSON.parse(JSON.stringify(style)) as Record<string, unknown>;
  const parts = key.split('.');
  const last = parts.pop() as string;
  let cursor = next;
  for (const part of parts) {
    cursor = cursor[part] as Record<string, unknown>;
  }
  cursor[last] = value;
  return next as unknown as MapStyle;
}

/**
 * 「自动」—— 方格大小回到 `null`（按画布自适应）。只有这一项可空，别的字段的
 * `null` 会被 schema 拒掉，所以单独给一个判断，而不是让每个调用方自己记。
 */
export function isAdaptiveField(key: string): boolean {
  return key === 'cellSize';
}

/** 表单保存前的自检：用主题的 schema 过一遍，避免把半截值写进库里。 */
export function isValidThemeStyle(style: MapStyle): boolean {
  return mapStyleSchema.safeParse(style).success;
}
