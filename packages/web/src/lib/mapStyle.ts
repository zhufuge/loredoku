import {
  CANVAS_SHADOW_ALPHA,
  DEFAULT_LINKAGE_COLORS,
  DEFAULT_MAP_STYLE,
  hexToRgb,
  LINKAGE_COLOR_KEY_PATTERN,
  LINKAGE_COLOR_LABEL_MAX_LENGTH,
  LINKAGE_COLOR_MAX_COUNT,
  LINKAGE_COLOR_MIN_COUNT,
  MAP_STYLE_CELL_SIZE_MAX,
  MAP_STYLE_CELL_SIZE_MIN,
  MAP_STYLE_COLOR_PATTERN,
  isMapStyleFontFamilyName,
  MAP_STYLE_LINE_WIDTH_MAX,
  MAP_STYLE_LINE_WIDTH_MIN,
  MAP_STYLE_OPERATION_OFFSET_MAX,
  MAP_STYLE_OPERATION_OFFSET_MIN,
  MAP_STYLE_RULER_FONT_MAX,
  MAP_STYLE_RULER_FONT_MIN,
  MAP_STYLE_RULER_GAP_MAX,
  MAP_STYLE_RULER_GAP_MIN,
  MAP_STYLE_RULER_SYMBOL_MAX_LENGTH,
  MAP_STYLE_RULER_DEFAULT_SYMBOLS,
  MAP_STYLE_ITEM_OUTLINE_WIDTH_MAX,
  MAP_STYLE_ITEM_OUTLINE_WIDTH_MIN,
  MAP_STYLE_SHADOW_OFFSET_MAX,
  MAP_STYLE_SHADOW_OFFSET_MIN,
  MAP_STYLE_REGION_LABEL_FONT_MAX,
  MAP_STYLE_REGION_LABEL_FONT_MIN,
  MAP_STYLE_REGION_LABEL_STROKE_MAX,
  MAP_STYLE_REGION_LABEL_STROKE_MIN,
  REGION_BORDER_WIDTH_MAX,
  REGION_BORDER_WIDTH_MIN,
  RULER_ACTIVE_FONT_DELTA,
  type CharacterSlotEntry,
  type MapLinkageColor,
  type MapStyleCanvasShadow,
  type MapStyleItemOutline,
  type MapStyleLine,
  type MapStyleMouseCursorBox,
  type MapStyleOperationCursorBox,
  type MapStyleRegionLabel,
  type MapStyleRuler,
  type MapStyle,
  type ParticipantTarget,
} from '@loredoku/shared';
import type { CSSProperties } from 'react';
import { cellScale, scaleFontSize, scaleLineWidth } from '@/lib/canvasScale';

/**
 * v0.3.8 FEAT-D02 (docs/v0.3.8.md §FEAT-D02): the map style is a set of
 * **map-level defaults**. `resolveMapStyle` is the single place that turns a
 * possibly-missing / possibly-out-of-range block into a fully populated,
 * clamped `MapStyle`, so the renderer never has to defend itself.
 */
export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function clampLineWidth(value: number): number {
  return clampNumber(value, MAP_STYLE_LINE_WIDTH_MIN, MAP_STYLE_LINE_WIDTH_MAX);
}

export function clampRegionLabelFont(value: number): number {
  return Math.round(clampNumber(value, MAP_STYLE_REGION_LABEL_FONT_MIN, MAP_STYLE_REGION_LABEL_FONT_MAX));
}

export function clampRegionLabelStroke(value: number): number {
  return clampNumber(value, MAP_STYLE_REGION_LABEL_STROKE_MIN, MAP_STYLE_REGION_LABEL_STROKE_MAX);
}

/**
 * v0.9.6：区域标签位置偏移（可正可负，取整）。
 *
 * 与 `clampRegionLabelStroke` 同一条路：输入框里可能是 `-`、空串、小数，这里
 * 统一取整。v0.10.7 起**不再封顶**（原来的 ±200 会把「推到远处留白」挡死），
 * 只把非有限数落回 0。单位是格的百分比（100 = 一格，v0.10.7 起）。
 */
export function clampRegionLabelOffset(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value);
}

export function clampOperationOffset(value: number): number {
  return clampNumber(value, MAP_STYLE_OPERATION_OFFSET_MIN, MAP_STYLE_OPERATION_OFFSET_MAX);
}

/** v0.9.1：画布阴影的偏移量（格的百分比，v0.10.7 起；100 = 一格），整数 0 ~ 200。 */
export function clampCanvasShadowOffset(value: number): number {
  return Math.round(clampNumber(value, MAP_STYLE_SHADOW_OFFSET_MIN, MAP_STYLE_SHADOW_OFFSET_MAX));
}

/** v0.9.1 §5：物品描边宽度，0 ~ 12（0 = 不描边）。允许小数，与线宽同档。 */
export function clampItemOutlineWidth(value: number): number {
  return clampNumber(value, MAP_STYLE_ITEM_OUTLINE_WIDTH_MIN, MAP_STYLE_ITEM_OUTLINE_WIDTH_MAX);
}

/** v0.3.9 FEAT-E02: ruler text size (integer px). */
export function clampRulerFontSize(value: number): number {
  return Math.round(clampNumber(value, MAP_STYLE_RULER_FONT_MIN, MAP_STYLE_RULER_FONT_MAX));
}

/** v0.3.9 FEAT-E02: gap between the ruler text and the board. */
export function clampRulerGap(value: number): number {
  return clampNumber(value, MAP_STYLE_RULER_GAP_MIN, MAP_STYLE_RULER_GAP_MAX);
}

/**
 * v0.10.8: the prefix printed in front of a ruler number (`C` / `R` by default).
 *
 * Not clamped to a range — it is a short piece of text. Only the length is
 * capped, and an empty string is preserved on purpose: it means "numbers only".
 * A non-string (hand-edited JSON) falls back to the built-in default.
 */
export function clampRulerSymbol(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  return value.slice(0, MAP_STYLE_RULER_SYMBOL_MAX_LENGTH);
}

/**
 * v0.10.8：把标尺符号从一份**地图草稿的**风格里剥掉。
 *
 * 符号只由主题配置（见 `useRulerSymbolsByCode`）：库里那两行旧值既不参与渲染，
 * 也不该在保存时被重新写回去 —— 否则作者改进主题、某张图的渲染却早已被自己那份
 * 覆盖，改不动也看不见。字段本身留在 `mapStyleSchema` 里，因为主题也用同一份
 * schema 存这两个值。
 */
export function stripRulerSymbols(style: MapStyle): MapStyle {
  const { columnSymbol: _columnSymbol, rowSymbol: _rowSymbol, ...rest } = style.ruler;
  const ruler: MapStyleRuler = { fontSize: rest.fontSize, gap: rest.gap };
  return { ...style, ruler };
}

export function clampRegionBorderWidth(value: number): number {
  return Math.round(clampNumber(value, REGION_BORDER_WIDTH_MIN, REGION_BORDER_WIDTH_MAX));
}

/**
 * v0.7.4: the label typeface is a **font name**, so there is nothing to clamp —
 * only a shape to check. A name that fails it (a hand-edited JSON, a draft
 * written by a newer build, an empty string) falls back to the shipped default
 * instead of leaking into `style.fontFamily`; a well-formed name that this
 * build does not ship still renders, the browser falls back along its stack.
 */
export function resolveFontFamilyName(value: unknown): string {
  if (typeof value === 'string') {
    const name = value.trim();
    if (isMapStyleFontFamilyName(name)) return name;
  }
  return DEFAULT_MAP_STYLE.regionLabel.fontFamily;
}

/** FEAT-D03: the explicit override, clamped to the adaptive range. */
export function clampCellSize(value: number): number {
  return Math.round(clampNumber(value, MAP_STYLE_CELL_SIZE_MIN, MAP_STYLE_CELL_SIZE_MAX));
}

export function isValidStyleColor(value: string): boolean {
  return MAP_STYLE_COLOR_PATTERN.test(value.trim());
}

/** The cursor shadow ring also accepts `rgb() / rgba()` (layout-free alpha). */
export function isValidShadowColor(value: string): boolean {
  const trimmed = value.trim();
  return isValidStyleColor(trimmed) || /^rgba?\([\d\s.,%]+\)$/.test(trimmed);
}

function color(fallback: string, value: unknown, guard: (v: string) => boolean = isValidStyleColor): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return guard(trimmed) ? trimmed : fallback;
}

function width(fallback: number, value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? clampLineWidth(value) : fallback;
}

/**
 * Fills in every missing field from `DEFAULT_MAP_STYLE`, clamping anything the
 * caller supplied. `version = 1` drafts (no `style` at all) therefore render
 * exactly like v0.3.7.
 */
export function resolveMapStyle(style?: Partial<MapStyle> | null): MapStyle {
  const source = (style ?? {}) as Partial<MapStyle>;
  const fallback = DEFAULT_MAP_STYLE;

  const canvasFrame: Partial<MapStyleLine> = source.canvasFrame ?? {};
  const canvasShadow: Partial<MapStyleCanvasShadow> = source.canvasShadow ?? {};
  const itemOutline: Partial<MapStyleItemOutline> = source.itemOutline ?? {};
  const gridSeparator: Partial<MapStyleLine> = source.gridSeparator ?? {};
  const mouseCursorBox: Partial<MapStyleMouseCursorBox> = source.mouseCursorBox ?? {};
  const operationCursorBox: Partial<MapStyleOperationCursorBox> = source.operationCursorBox ?? {};
  const regionLabel: Partial<MapStyleRegionLabel> = source.regionLabel ?? {};
  const regionOutline: Partial<MapStyleLine> = source.regionOutline ?? {};
  const regionHighlight: Partial<MapStyleLine> = source.regionHighlight ?? {};
  const ruler: Partial<MapStyleRuler> = source.ruler ?? {};

  const baseLabelFontSize =
    typeof regionLabel.fontSize === 'number'
      ? clampRegionLabelFont(regionLabel.fontSize)
      : fallback.regionLabel.fontSize;

  return {
    cellSize:
      typeof source.cellSize === 'number' && Number.isFinite(source.cellSize)
        ? clampCellSize(source.cellSize)
        : null,
    canvasFrame: {
      width: width(fallback.canvasFrame.width, canvasFrame.width),
      color: color(fallback.canvasFrame.color, canvasFrame.color),
    },
    canvasShadow: {
      offset:
        typeof canvasShadow.offset === 'number'
          ? clampCanvasShadowOffset(canvasShadow.offset)
          : fallback.canvasShadow.offset,
      color: color(fallback.canvasShadow.color, canvasShadow.color),
    },
    itemOutline: {
      width:
        typeof itemOutline.width === 'number'
          ? clampItemOutlineWidth(itemOutline.width)
          : fallback.itemOutline.width,
      color: color(fallback.itemOutline.color, itemOutline.color),
    },
    gridSeparator: {
      width: width(fallback.gridSeparator.width, gridSeparator.width),
      color: color(fallback.gridSeparator.color, gridSeparator.color),
    },
    mouseCursorBox: {
      width: width(fallback.mouseCursorBox.width, mouseCursorBox.width),
      color: color(fallback.mouseCursorBox.color, mouseCursorBox.color),
      blockedColor: color(fallback.mouseCursorBox.blockedColor, mouseCursorBox.blockedColor),
      shadowColor: color(
        fallback.mouseCursorBox.shadowColor,
        mouseCursorBox.shadowColor,
        isValidShadowColor,
      ),
    },
    operationCursorBox: {
      width: width(fallback.operationCursorBox.width, operationCursorBox.width),
      color: color(fallback.operationCursorBox.color, operationCursorBox.color),
      offset:
        typeof operationCursorBox.offset === 'number'
          ? clampOperationOffset(operationCursorBox.offset)
          : fallback.operationCursorBox.offset,
    },
    regionLabel: {
      fontFamily: resolveFontFamilyName(regionLabel.fontFamily),
      fontSize: baseLabelFontSize,
      strokeWidth:
        typeof regionLabel.strokeWidth === 'number'
          ? clampRegionLabelStroke(regionLabel.strokeWidth)
          : fallback.regionLabel.strokeWidth,
      color: color(fallback.regionLabel.color, regionLabel.color),
      strokeColor: color(fallback.regionLabel.strokeColor, regionLabel.strokeColor),
      // v0.5.2 FIX-M02: the hovered label is **never smaller** than the idle
      // one — a bad draft / import that says otherwise is lifted back up.
      hoverFontSize: Math.max(
        baseLabelFontSize,
        typeof regionLabel.hoverFontSize === 'number'
          ? clampRegionLabelFont(regionLabel.hoverFontSize)
          : fallback.regionLabel.hoverFontSize,
      ),
      hoverColor: color(fallback.regionLabel.hoverColor, regionLabel.hoverColor),
      hoverStrokeColor: color(fallback.regionLabel.hoverStrokeColor, regionLabel.hoverStrokeColor),
      // v0.7.0: the hovered label's own stroke size — no "never smaller" rule
      // here, the author may thin the hovered stroke on purpose.
      hoverStrokeWidth:
        typeof regionLabel.hoverStrokeWidth === 'number'
          ? clampRegionLabelStroke(regionLabel.hoverStrokeWidth)
          : fallback.regionLabel.hoverStrokeWidth,
    },
    regionOutline: {
      // The region outline follows its own 4 ~ 12px range, not the line range.
      width:
        typeof regionOutline.width === 'number'
          ? clampRegionBorderWidth(regionOutline.width)
          : fallback.regionOutline.width,
      color: color(fallback.regionOutline.color, regionOutline.color),
    },
    regionHighlight: {
      width: width(fallback.regionHighlight.width, regionHighlight.width),
      color: color(fallback.regionHighlight.color, regionHighlight.color),
    },
    ruler: {
      fontSize:
        typeof ruler.fontSize === 'number'
          ? clampRulerFontSize(ruler.fontSize)
          : fallback.ruler.fontSize,
      gap: typeof ruler.gap === 'number' ? clampRulerGap(ruler.gap) : fallback.ruler.gap,
      columnSymbol: clampRulerSymbol(
        ruler.columnSymbol,
        MAP_STYLE_RULER_DEFAULT_SYMBOLS.columnSymbol,
      ),
      rowSymbol: clampRulerSymbol(ruler.rowSymbol, MAP_STYLE_RULER_DEFAULT_SYMBOLS.rowSymbol),
    },
  };
}

/**
 * FEAT-D04: keeps only well-formed, uniquely-keyed entries and caps the list.
 *
 * The 2-entry minimum is enforced by the **schema** (`mapStyleSchema`) and by
 * the drawer (delete is disabled at the minimum) — `resolveMapStyle` must NOT
 * re-add a removed colour, or deleting an entry would silently resurrect it.
 * The shipped palette is only used when nothing usable is left at all.
 */
export function resolveLinkageColors(
  value?: Array<Partial<MapLinkageColor>> | null,
): MapLinkageColor[] {
  const list: MapLinkageColor[] = [];
  const seen = new Set<string>();
  for (const entry of value ?? []) {
    if (!entry) continue;
    const key = typeof entry.key === 'string' ? entry.key.trim() : '';
    if (!LINKAGE_COLOR_KEY_PATTERN.test(key) || seen.has(key)) continue;
    if (!isValidStyleColor(String(entry.color ?? ''))) continue;
    seen.add(key);
    list.push({
      key,
      label:
        typeof entry.label === 'string' && entry.label.trim().length > 0
          ? entry.label.trim().slice(0, LINKAGE_COLOR_LABEL_MAX_LENGTH)
          : key,
      color: String(entry.color).trim(),
    });
  }
  if (list.length === 0) return DEFAULT_LINKAGE_COLORS.map((entry) => ({ ...entry }));
  return list.slice(0, LINKAGE_COLOR_MAX_COUNT);
}

/**
 * v0.5.0 FEAT-K14 (docs/v0.5.0.md §2.6 / Q16): the palette left `MapStyle` —
 * a puzzle owns it now. The editor merges the puzzle's `linkageColors` back in
 * at render time, which is why both lookups below take the palette directly
 * instead of a whole `MapStyle`.
 */
export function linkageColorFor(palette: MapLinkageColor[], key: string): string {
  return (
    palette.find((entry) => entry.key === key)?.color ??
    palette[0]?.color ??
    DEFAULT_LINKAGE_COLORS[0]!.color
  );
}

export function linkageLabelFor(palette: MapLinkageColor[], key: string): string {
  return palette.find((entry) => entry.key === key)?.label ?? palette[0]?.label ?? key;
}

/** Assigns a stable, unused palette key (`c3`, `c4`, …). */
export function nextLinkageKey(existing: MapLinkageColor[]): string {
  const taken = new Set(existing.map((entry) => entry.key));
  for (let index = existing.length + 1; index < existing.length + 100; index += 1) {
    const candidate = `c${index}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `c${Date.now()}`;
}

/**
 * FEAT-D04 §UI 规则: when a palette entry is deleted, every linkage that
 * referenced it is re-pointed at `toKey` so no draft is left with a dangling
 * colour. Pure so it can be unit-tested without a store.
 */
export function retargetLinkageColors(
  slots: Array<CharacterSlotEntry | null>,
  fromKey: string,
  toKey: string,
): Array<CharacterSlotEntry | null> {
  if (fromKey === toKey) return slots;
  return slots.map((slot) => {
    if (!slot?.linkages) return slot;
    let touched = false;
    const linkages: ParticipantTarget[] = slot.linkages.map((target) => {
      if (target.color !== fromKey) return target;
      touched = true;
      return { ...target, color: toKey };
    });
    return touched ? { ...slot, linkages } : slot;
  });
}

/** How many linkages reference a palette key — drives the delete confirm. */
export function countLinkageColorUsage(
  slots: Array<CharacterSlotEntry | null>,
  key: string,
): number {
  let count = 0;
  for (const slot of slots) {
    for (const target of slot?.linkages ?? []) {
      if (target.color === key) count += 1;
    }
  }
  return count;
}

/**
 * The effective cell width at 100% zoom。
 *
 * FEAT-D03 起，作者可以在「地图基本信息」里写死一个 `cellSize`。v0.10.3 把它从
 * **定值**降级成**上限**：渲染永远不超过视口算出来的那个数。
 *
 * 为什么必须降级：`fit()` 先按 `<main>` 的宽高算出一个刚好的格子，旧写法又把这个
 * 结果整个换成作者写的值 —— 26 关里有 23 关的作者值比视口装得下的大，于是棋盘从
 * 上下两头被 `overflow-hidden` 切掉（`<main>` 不可滚，也没有任何提示）。棋盘是玩
 * 这件东西的唯一界面，宁可格子比作者写的略小，也不能缺一角。
 *
 * 为什么只压上限、不干脆忽略：存量里 78 张图带着 36 ~ 168 的值，那是作者当时
 * 「别铺得太大」的意思。屏幕变大时允许它跟着长到 240（`MAX_CELL_SIZE`），但不
 * 越过作者写的数。界面上这枚输入已经撤掉，新图一律自适应。
 */
export function effectiveCellSize(autoCellSize: number, style: MapStyle): number {
  const authored = style.cellSize;
  if (typeof authored !== 'number' || !Number.isFinite(authored)) return autoCellSize;
  return Math.min(authored, autoCellSize);
}

/** The scaled line width for one style field, used by every drawing layer. */
export function styleLineWidth(base: number, cellSize: number): number {
  return scaleLineWidth(base, cellScale(cellSize));
}

/**
 * v0.8.7 §6：画布纸片的投影。v0.9.1 §2 起偏移量与颜色都读 `style.canvasShadow`
 * —— 作者能在「地图基本信息」或主题缺省风格里各配各的，不再跟着外框色走。
 *
 * 为什么是硬影（`blur = 0`）：这张图的气质是一条线画到底的（网格、框、标签都在
 * 1 ~ 12px 的细线里），一团弥散阴影会第一个跳出来抢注意力。向右下偏移的硬影说的
 * 是「一叠纸」，不是「浮窗」。
 *
 * 透明度仍是固定值 {@link CANVAS_SHADOW_ALPHA}（0.3）：颜色只收 `#RRGGBB`，不开放
 * alpha —— 影子是「颜色 + 固定一层淡度」，不让人去调第二个数。
 *
 * 返回值直接摊进画布底色那一层（`MAP_LAYER_Z.canvasBase`）的 `style`：它在缩放
 * 容器里，所以偏移量随 `zoom` 一起缩放，和线宽同一套规矩。
 *
 * v0.10.7：`canvasShadow.offset` 改成**格的百分比**（100 = 一格），这里乘
 * `cellSize` 换成像素。以前它直接就是像素，于是同一份 `36` 在 104px 的格子上是
 * 三分之一格、在 168px 的格子上只有五分之一格 —— 阴影大小跟着格子大小变。
 */
export function canvasShadowStyle(style: MapStyle, cellSize: number): CSSProperties {
  const { r, g, b } = hexToRgb(style.canvasShadow.color);
  const offset = (style.canvasShadow.offset / 100) * cellSize;
  return {
    boxShadow: `${offset}px ${offset}px 0 rgba(${r}, ${g}, ${b}, ${CANVAS_SHADOW_ALPHA})`,
  };
}

/**
 * v0.9.1 §5：物品描边。返回 CSS `filter`；宽度为 0（出厂默认）时返回 `undefined`，
 * 调用方据此不挂 filter —— 零宽描边不该在 DOM 上留一条 `drop-shadow(0px 0 0 …)`。
 *
 * 用 4 向硬 `drop-shadow` 叠成一圈**剪影描边**：跟着物品图片的 alpha 走，透明
 * 背景的物品得到的是一圈贴着实物的边，而不是一个矩形框。宽度先按方格尺寸缩放
 * （`styleLineWidth`，与线宽同一套规矩），颜色直接用配置的 `#RRGGBB`。
 */
export function itemOutlineFilter(
  outline: MapStyleItemOutline,
  cellSize: number,
): string | undefined {
  if (!(outline.width > 0)) return undefined;
  const px = styleLineWidth(outline.width, cellSize);
  if (!(px > 0)) return undefined;
  const { color } = outline;
  return [
    `drop-shadow(${px}px 0 0 ${color})`,
    `drop-shadow(-${px}px 0 0 ${color})`,
    `drop-shadow(0 ${px}px 0 ${color})`,
    `drop-shadow(0 -${px}px 0 ${color})`,
  ].join(' ');
}

/**
 * v0.3.9 FEAT-E01: the 「地图基本信息」drawer keeps a draft and only commits on
 * save, so it needs to know whether anything actually changed. Comparing the
 * two resolved styles field by field is enough — both sides have already been
 * normalised by {@link resolveMapStyle}. (v0.5.0 FEAT-K14: the palette is no
 * longer part of `MapStyle`, so it is out of scope here.)
 */
export function mapStyleEquals(a: MapStyle, b: MapStyle): boolean {
  if (a === b) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

/** v0.3.9 FEAT-E02: the operated row / column glyph stays `delta` px larger. */
export function rulerActiveFontSize(fontSize: number, scale: number): number {
  return scaleFontSize(fontSize + RULER_ACTIVE_FONT_DELTA, scale);
}
