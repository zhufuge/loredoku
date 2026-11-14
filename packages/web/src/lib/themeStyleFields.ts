import {
  DEFAULT_MAP_STYLE,
  MAP_STYLE_LINE_WIDTH_MAX,
  MAP_STYLE_LINE_WIDTH_MIN,
  MAP_STYLE_FIELDS,
  MAP_STYLE_OPERATION_OFFSET_MAX,
  MAP_STYLE_OPERATION_OFFSET_MIN,
  MAP_STYLE_REGION_LABEL_FONT_MAX,
  MAP_STYLE_REGION_LABEL_FONT_MIN,
  MAP_STYLE_REGION_LABEL_STROKE_MAX,
  MAP_STYLE_REGION_LABEL_STROKE_MIN,
  MAP_STYLE_RULER_FONT_MAX,
  MAP_STYLE_RULER_FONT_MIN,
  MAP_STYLE_ITEM_OUTLINE_WIDTH_MAX,
  MAP_STYLE_ITEM_OUTLINE_WIDTH_MIN,
  MAP_STYLE_RULER_GAP_MAX,
  MAP_STYLE_RULER_SYMBOL_MAX_LENGTH,
  MAP_STYLE_RULER_GAP_MIN,
  MAP_STYLE_SHADOW_OFFSET_MAX,
  MAP_STYLE_SHADOW_OFFSET_MIN,
  REGION_BORDER_WIDTH_MAX,
  REGION_BORDER_WIDTH_MIN,
  mapStyleSchema,
  type MapStyle,
} from '@loredoku/shared';

/**
 * v0.8.3（docs/v0.8.3.md §2）—— 概览页「地图初始样式」表单的字段表。
 *
 * **标签与顺序不在这里**：那是 `MAP_STYLE_FIELDS`（`shared/mapStyleDiff.ts`）的
 * 活儿 —— 差异弹窗已经按它列了二十几项，概览页再抄一份，两份迟早会漂。这里只补
 * 一件那边没有的信息：**怎么改回去**（控件类型与区间）。
 *
 * 于是「显示什么」和「怎么改」严格同一个集合：`MAP_STYLE_FIELDS` 里多一项而这里
 * 没跟，`THEME_STYLE_FIELDS` 会带上 `kind: 'unknown'`，`themeStyleFields.test.ts`
 * 直接失败 —— 而不是在界面上悄悄少一行。
 */

/**
 * v0.8.6 §1：概览页**不列**「方格大小」。
 *
 * 它不是风格，是这张图自己的事 —— 由画布尺寸与「定尺寸」那一刻算出来的值决定
 * （`null` = 按画布自适应），一张图一个数。要改它就去那张图的「基本信息」。
 *
 * 主题的缺省风格里这一项仍然存在，只是这个空间级清单不再提供入口。所以这里只做
 * **显示过滤**，不是把字段从 `MapStyle` 里拿掉。
 *
 * v0.10.2：这份「主题设置里不出现的键」现在是**共用**的 —— 「基本信息」抽屉底部
 * 的差异弹窗（`ThemeStyleRow`）原来还会列出「方格大小 168px → 146px」，等于把
 * 一张图自己的尺寸当成「与主题风格不同」报给作者；两个方向的动作（应用 / 设为）
 * 也会顺手把它带过去。同一份清单管住这三处，就不会再冒出第四处。
 */
export const THEME_HIDDEN_STYLE_KEYS = new Set(['cellSize']);

/**
 * v0.10.8：**地图草稿里**不参与比对、也不该留存的键 —— 目前是标尺的行列符号。
 *
 * 符号只由主题配置（`MapRulerStrips` 按 `themeCode` 查主题）。地图的「基本信息」
 * 抽屉里从来没有这两个输入框，所以一张旧图里残留的 `C` / `R` 与主题的「列」/「行」
 * 之间的差异，作者在界面上**无处可改** —— 报在差异弹窗里只会让人以为是坏数据。
 *
 * 与 {@link THEME_HIDDEN_STYLE_KEYS} 的区别：那份是「主题设置里不给入口」，
 * 这份是「地图侧根本不留存」，所以主题表单仍然要能配这两项。
 */
export const MAP_DRAFT_HIDDEN_STYLE_KEYS = new Set(['ruler.columnSymbol', 'ruler.rowSymbol']);

export type ThemeStyleFieldKind = 'number' | 'color' | 'shadow' | 'text' | 'unknown';

interface WriteSpec {
  kind: Exclude<ThemeStyleFieldKind, 'unknown'>;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  /** v0.10.8：`kind: 'text'` 的输入长度上限（标尺符号 4 个字符）。 */
  maxLength?: number;
  /**
   * v0.10.8：允许把这个文本字段清空。
   *
   * 标尺符号留空是**有意义**的（只显示数字），而字体名留空没有意义 —— 所以默认
   * 不允许清空，只有标尺符号两行打开它。
   */
  allowEmpty?: boolean;
}

/**
 * 线宽的上下界是同一组（1 ~ 12），字体与间距各有各的；颜色一律走取色控件，
 * 只有阴影环例外 —— 它允许 `rgba()`（`MAP_STYLE_SHADOW_PATTERN`），取色器给不出
 * 带透明度的值。
 */
const WRITE_SPECS: Record<string, WriteSpec> = {
  'gridSeparator.width': { kind: 'number', min: MAP_STYLE_LINE_WIDTH_MIN, max: MAP_STYLE_LINE_WIDTH_MAX, suffix: 'px' },
  'gridSeparator.color': { kind: 'color' },

  'canvasFrame.width': { kind: 'number', min: MAP_STYLE_LINE_WIDTH_MIN, max: MAP_STYLE_LINE_WIDTH_MAX, suffix: 'px' },
  'canvasFrame.color': { kind: 'color' },
  'canvasShadow.offset': { kind: 'number', min: MAP_STYLE_SHADOW_OFFSET_MIN, max: MAP_STYLE_SHADOW_OFFSET_MAX, suffix: '%' },
  'canvasShadow.color': { kind: 'color' },
  'regionOutline.width': { kind: 'number', min: REGION_BORDER_WIDTH_MIN, max: REGION_BORDER_WIDTH_MAX, suffix: 'px' },
  'regionOutline.color': { kind: 'color' },
  'regionHighlight.width': { kind: 'number', min: MAP_STYLE_LINE_WIDTH_MIN, max: MAP_STYLE_LINE_WIDTH_MAX, step: 0.5, suffix: 'px' },
  'regionHighlight.color': { kind: 'color' },

  'itemOutline.width': { kind: 'number', min: MAP_STYLE_ITEM_OUTLINE_WIDTH_MIN, max: MAP_STYLE_ITEM_OUTLINE_WIDTH_MAX, suffix: 'px' },
  'itemOutline.color': { kind: 'color' },

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
  // v0.10.8：列 / 行标尺的前缀符号，默认 `C` / `R`。允许为空（只显示数字）。
  'ruler.columnSymbol': { kind: 'text', maxLength: MAP_STYLE_RULER_SYMBOL_MAX_LENGTH, allowEmpty: true },
  'ruler.rowSymbol': { kind: 'text', maxLength: MAP_STYLE_RULER_SYMBOL_MAX_LENGTH, allowEmpty: true },

  'mouseCursorBox.width': { kind: 'number', min: MAP_STYLE_LINE_WIDTH_MIN, max: MAP_STYLE_LINE_WIDTH_MAX, suffix: 'px' },
  'mouseCursorBox.color': { kind: 'color' },
  'mouseCursorBox.blockedColor': { kind: 'color' },
  'mouseCursorBox.shadowColor': { kind: 'shadow' },
  'operationCursorBox.width': { kind: 'number', min: MAP_STYLE_LINE_WIDTH_MIN, max: MAP_STYLE_LINE_WIDTH_MAX, suffix: 'px' },
  'operationCursorBox.color': { kind: 'color' },
  'operationCursorBox.offset': { kind: 'number', min: MAP_STYLE_OPERATION_OFFSET_MIN, max: MAP_STYLE_OPERATION_OFFSET_MAX, suffix: '%' },
};

/**
 * v0.8.6 §1.6：每项一句解释，跟在地图「基本信息」抽屉的标签后面 —— 两边说的是
 * 同一件事，用的也是同一套写法（英文名先出场，再一句中文）。
 *
 * 为什么放在这里而不是页面里：这里的字段是 `MAP_STYLE_FIELDS` 派生的，页面只
 * 负责排版；解释跟着字段走，才不会出现「表里加了一项、页面上那一行没有问号」。
 */
const FIELD_HINTS: Record<string, string> = {
  'gridSeparator.width':
    'Grid Separator — 方格之间的内部分隔线。相邻两格共享同一条线，n × n 的画布只有 n − 1 条横线与 n − 1 条竖线。',
  'gridSeparator.color': '网格分隔线 — 颜色与线宽一起决定网格看起来有多重。',

  'canvasFrame.width':
    'Canvas Frame — 整张画布最外圈的边框线，画在画布矩形之外，与格内内容不重叠。',
  'canvasFrame.color': '画布外框 — 最外圈那条线的颜色。',
  'canvasShadow.offset': 'Canvas Shadow — 画布纸片投下的硬影，向右下偏移这么多；按方格大小的百分比算（100% = 一格），格子缩放时占比不变。0 就是不投。',
  'canvasShadow.color': '画布阴影颜色 — 影子统一压 30% 透明度，所以浅色看起来会比原色淡。',
  'regionOutline.width': 'Region Outline — 区域自己的边界线，与画布外框、网格线都不是一回事。',
  'regionOutline.color': '区域轮廓线 — 区域边界线的颜色。',
  'regionHighlight.width': 'Region Highlight — 指针停在区域上时压在最上面的一层高亮。',
  'regionHighlight.color': '区域高亮线 — 那层高亮的颜色。',

  'itemOutline.width': 'Item Outline — 沿物品图片轮廓画一圈描边；0 就是不描边（出厂默认），1 ~ 12 与线宽同档。',
  'itemOutline.color': '物品描边颜色 — 描边压在物品轮廓外圈，选和底图反差大的颜色。',

  'regionLabel.fontFamily':
    'Region Label — 区域名用的字体。写本机已有的字体名（如「霞鹜文楷」）；访客没有这个字体时退回系统默认。',
  'regionLabel.fontSize': '标签字号 — 区域名的字号，基准值，随方格尺寸等比缩放。',
  'regionLabel.color': '标签颜色 — 区域名的字色。',
  'regionLabel.strokeWidth': '标签描边 — 用来把字从地图底纹里拔出来；0 就是不描边。',
  'regionLabel.strokeColor': '标签描边颜色 — 描边与字色要拉开明度，否则等于没描。',
  'regionLabel.hoverFontSize': 'Region Label Hover — 指针停在区域上时放大到这一号。',
  'regionLabel.hoverColor': '悬停颜色 — 悬停时区域名的字色。',
  'regionLabel.hoverStrokeWidth': '悬停描边 — 悬停时字描边的粗细。',
  'regionLabel.hoverStrokeColor': '悬停描边颜色 — 悬停时描边的颜色。',
  'ruler.fontSize': 'Ruler — 沿画布上边缘与左边缘的行列标尺；操作格所在行列比普通文本大 2px。',
  'ruler.gap': 'Ruler Gap — 标尺文本到画布的距离，同时参与标尺条厚度的计算。',
  'ruler.columnSymbol':
    '列标尺符号 — 列号前面那个字符，默认 `C`（如 `C1`）。中文图可以填「列」，留空则只显示数字。最多 4 个字符。',
  'ruler.rowSymbol':
    '行标尺符号 — 行号前面那个字符，默认 `R`（如 `R1`）。中文图可以填「行」，留空则只显示数字。最多 4 个字符。',

  'mouseCursorBox.width':
    'Mouse Cursor Box — 跟随指针移动的方格框，画布最高层，任何内容都盖不住它。',
  'mouseCursorBox.color': '鼠标光标框 — 指针落在可走格子上时的颜色。',
  'mouseCursorBox.blockedColor': '阻挡色 — 指针落在走不进去的格子上时，框换成这个颜色。',
  'mouseCursorBox.shadowColor': '阴影环 — 允许带透明度（rgba），所以它是文本框而不是取色器。',
  'operationCursorBox.width':
    'Operation Cursor Box — 固定在「当前操作格」上的框，以外描边画在网格线外侧，不参与布局。',
  'operationCursorBox.color': '操作光标框 — 那个框的颜色。',
  'operationCursorBox.offset': '外扩距离 — 框相对方格向外扩多少，按方格大小的百分比算（100% = 一格）。',
};

/** 四组的解释 —— 抽屉里每个分区标题后面的那个问号。 */
export const THEME_STYLE_GROUP_HINTS: Record<string, string> = {
  网格: 'Grid — 方格之间的分隔线。',
  边框: 'Frame — 画布外圈与区域边框。',
  物品: 'Item — 放在地图上的物品的描边（默认关闭）。',
  标签: 'Label — 区域名在常态与悬停下的样子，以及行列标尺。',
  光标: 'Cursor — 指针经过时的高亮框，画布最上面那一层。',
};

export interface ThemeStyleField {
  key: string;
  group: string;
  label: string;
  kind: ThemeStyleFieldKind;
  /** 跟在标签后面的一句话（v0.8.6 §1.6），与抽屉的字段同一口径。 */
  hint?: string;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  /** v0.10.8：`kind: 'text'` 的输入长度上限。 */
  maxLength?: number;
  /** v0.10.8：允许清空（标尺符号留空 = 只显示数字）。 */
  allowEmpty?: boolean;
  /** 当前值格式化后的样子（`1.5px` / `#2f2a24` / `自适应`），与差异弹窗同一套写法。 */
  format: (style: MapStyle) => string;
  /** 原始值 —— 表单控件要的是它，不是格式化后的字符串。 */
  read: (style: MapStyle) => string | number | null;
}

export const THEME_STYLE_FIELDS: readonly ThemeStyleField[] = MAP_STYLE_FIELDS.filter(
  (field) => !THEME_HIDDEN_STYLE_KEYS.has(field.key),
).map((field) => {
  const spec = WRITE_SPECS[field.key];
  return {
    key: field.key,
    group: field.group,
    label: field.label,
    kind: spec?.kind ?? 'unknown',
    hint: FIELD_HINTS[field.key],
    min: spec?.min,
    max: spec?.max,
    step: spec?.step,
    suffix: spec?.suffix,
    maxLength: spec?.maxLength,
    allowEmpty: spec?.allowEmpty,
    read: field.read,
    format: (style: MapStyle) => (field.format ?? String)(field.read(style)),
  };
});

/**
 * 写回一个值，返回**新的** `MapStyle`。
 *
 * 走「深拷贝 + 按路径写」而不是二十几个手写展开：路径就是 `MAP_STYLE_FIELDS` 里的
 * key，两者永远对得上；手写展开则每个字段都要记得把三层对象都铺开，漏一层就会
 * 把兄弟字段抹掉（那份代码在这仓里已经出现过一次）。
 *
 * **没在字段表里的键原样带着** —— 概览页不再列「方格大小」，但主题的风格里那一项
 * 仍然是有效的，改别的字段不该把它抹成 `undefined`（v0.8.6 §1）。
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
 * v0.8.6 §1：「恢复默认」只把**表单上看得见的**字段拨回出厂值。
 *
 * 原来是一句 `setStyle(DEFAULT_MAP_STYLE)`，那会把 `cellSize` 也一起拨回 `null`。
 * 方格大小已经不在清单上 —— 作者按了「恢复默认」，看不见的那一项被改掉了，
 * 保存后新地图就不再是原来那个格子尺寸。改不到的东西不该被顺手改掉。
 */
export function resetThemeStyle(style: MapStyle): MapStyle {
  return THEME_STYLE_FIELDS.reduce(
    (next, field) => writeStyleValue(next, field.key, field.read(DEFAULT_MAP_STYLE)),
    style,
  );
}

/**
 * v0.10.2：「应用主题风格」只灌**看得见的**字段，本图自己的方格大小原样留着。
 *
 * 与 `resetThemeStyle` 是同一个招式（逐项写回，而不是整份替换）：整份替换会把
 * 主题里可能残留的 `cellSize` 一起盖上来 —— 作者刚把这张图定成 146px，点一下
 * 「应用主题风格」就变回 168px，而那一项在主题设置里已经看不见了，没处找回来。
 */
export function applyThemeStyle(style: MapStyle, themeStyle: MapStyle): MapStyle {
  return THEME_STYLE_FIELDS.filter((field) => !MAP_DRAFT_HIDDEN_STYLE_KEYS.has(field.key)).reduce(
    (next, field) => writeStyleValue(next, field.key, field.read(themeStyle)),
    style,
  );
}

/**
 * v0.10.2：把一份风格收成「主题该存的样子」—— 看不见的键一律归零。
 *
 * 「设为主题风格」原来把本图整份 `MapStyle`（含 `cellSize: 146`）写进主题。服务端
 * 建新地图时会自己把 `cellSize` 置 `null`（`mapCanvasService.ts` 的 `initialStyle`），
 * 所以那个数字从来没生效过；但库里留着一个谁也改不到、谁也看不见的值，下一个读
 * 主题风格的地方就会再踩一次。不如在写进去的那一刻就归零。
 */
export function stripThemeHiddenStyle(style: MapStyle): MapStyle {
  return [...THEME_HIDDEN_STYLE_KEYS].reduce<MapStyle>(
    (next, key) => writeStyleValue(next, key, null),
    style,
  );
}

/** 表单保存前的自检：用主题的 schema 过一遍，避免把半截值写进库里。 */
export function isValidThemeStyle(style: MapStyle): boolean {
  return mapStyleSchema.safeParse(style).success;
}
