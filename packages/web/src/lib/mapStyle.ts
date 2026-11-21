import {
  CANVAS_SHADOW_ALPHA,
  DEFAULT_LINKAGE_COLORS,
  DEFAULT_MAP_STYLE,
  hexToRgb,
  LINKAGE_COLOR_KEY_PATTERN,
  LINKAGE_COLOR_LABEL_MAX_LENGTH,
  LINKAGE_COLOR_MAX_COUNT,
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

/** v0.3.8 FEAT-D02 (docs/v0.3.8.md §FEAT-D02): the map style is a set of **map-level defaults**. `resolveMapStyle` is the single place that turns a possibly-missing / possibly-out-of-range block into a fully populated, clamped `MapStyle`, so the renderer never has to defend itself. */
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

/** 区域标签位置偏移（可正可负，取整）。 与 `clampRegionLabelStroke` 同一条路：输入框里可能是 `-`、空串、小数，这里统一取整。**不封顶** —— 封顶会把「推到远处留白」挡死；只把非有限数落回 0。 单位是格的百分比（100 = 一格）。 */
export function clampRegionLabelOffset(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value);
}

export function clampOperationOffset(value: number): number {
  return clampNumber(value, MAP_STYLE_OPERATION_OFFSET_MIN, MAP_STYLE_OPERATION_OFFSET_MAX);
}

/** 画布阴影的偏移量（格的百分比，100 = 一格），整数 0 ~ 200。 */
export function clampCanvasShadowOffset(value: number): number {
  return Math.round(clampNumber(value, MAP_STYLE_SHADOW_OFFSET_MIN, MAP_STYLE_SHADOW_OFFSET_MAX));
}

/** v0.9.1 §5：物品描边宽度，0 ~ 12（0 = 不描边）。允许小数，与线宽同档。 */
export function clampItemOutlineWidth(value: number): number {
  return clampNumber(value, MAP_STYLE_ITEM_OUTLINE_WIDTH_MIN, MAP_STYLE_ITEM_OUTLINE_WIDTH_MAX);
}

/** Ruler text size (integer px). */
export function clampRulerFontSize(value: number): number {
  return Math.round(clampNumber(value, MAP_STYLE_RULER_FONT_MIN, MAP_STYLE_RULER_FONT_MAX));
}

/** Gap between the ruler text and the board. */
export function clampRulerGap(value: number): number {
  return clampNumber(value, MAP_STYLE_RULER_GAP_MIN, MAP_STYLE_RULER_GAP_MAX);
}

/** The prefix printed in front of a ruler number (`C` / `R` by default). Not clamped to a range — it is a short piece of text. Only the length is capped, and an empty string is preserved on purpose: it means "numbers only". A non-string (hand-edited JSON) falls back to the built-in default. */
export function clampRulerSymbol(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  return value.slice(0, MAP_STYLE_RULER_SYMBOL_MAX_LENGTH);
}

/** 把标尺符号从一份**地图草稿的**风格里剥掉。 符号只由主题配置（见 `useRulerSymbolsByCode`）：库里那两行旧值既不参与渲染， 也不该在保存时被重新写回去 —— 否则作者改进主题、某张图的渲染却早已被自己那份覆盖，改不动也看不见。字段本身留在 `mapStyleSchema` 里，因为主题也用同一份 schema 存这两个值。 */
export function stripRulerSymbols(style: MapStyle): MapStyle {
  const { columnSymbol: _columnSymbol, rowSymbol: _rowSymbol, ...rest } = style.ruler;
  const ruler: MapStyleRuler = { fontSize: rest.fontSize, gap: rest.gap };
  return { ...style, ruler };
}

export function clampRegionBorderWidth(value: number): number {
  return Math.round(clampNumber(value, REGION_BORDER_WIDTH_MIN, REGION_BORDER_WIDTH_MAX));
}

/** The label typeface is a **font name**, so there is nothing to clamp — only a shape to check. */
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

/** Fills in every missing field from `DEFAULT_MAP_STYLE`, clamping anything the caller supplied. `version = 1` drafts (no `style` at all) therefore render exactly like v0.3.7. */
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
      // The hovered label is **never smaller** than the idle
      // one — a bad draft / import that says otherwise is lifted back up.
      hoverFontSize: Math.max(
        baseLabelFontSize,
        typeof regionLabel.hoverFontSize === 'number'
          ? clampRegionLabelFont(regionLabel.hoverFontSize)
          : fallback.regionLabel.hoverFontSize,
      ),
      hoverColor: color(fallback.regionLabel.hoverColor, regionLabel.hoverColor),
      hoverStrokeColor: color(fallback.regionLabel.hoverStrokeColor, regionLabel.hoverStrokeColor),
      // The hovered label's own stroke size — no "never smaller" rule
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

/** FEAT-D04: keeps only well-formed, uniquely-keyed entries and caps the list. The shipped palette is only used when nothing usable is left at all. */
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

/** v0.5.0 FEAT-K14 (docs/v0.5.0.md §2.6 / Q16): the palette left `MapStyle` — a puzzle owns it now. The editor merges the puzzle's `linkageColors` back in at render time, which is why both lookups below take the palette directly instead of a whole `MapStyle`. */
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

/** FEAT-D04 §UI 规则: when a palette entry is deleted, every linkage that referenced it is re-pointed at `toKey` so no draft is left with a dangling colour. Pure so it can be unit-tested without a store. */
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

/** The effective cell width at 100% zoom。 作者可以在「地图基本信息」里写死一个 `cellSize`，它是**上限**：渲染永远不超过 视口算出来的那个数。 为什么是上限：`fit()` 先按 `<main>` 的宽高算出一个刚好的格子； 若把结果整个换成 作者写的值，作者值大于视口时棋盘就从上下两头被 `overflow-hidden` 切掉（`<main>` 不可滚，也没有任何提示）。 棋盘是玩这件东西的唯一界面，宁可格子比作者写的略小， 也不能缺一角。 屏幕变大时允许它跟着长到 240（`MAX_CELL_SIZE`），但不 越过作者写的数。 界面上这枚输入已经撤掉，新图一律自适应。 */
export function effectiveCellSize(autoCellSize: number, style: MapStyle): number {
  const authored = style.cellSize;
  if (typeof authored !== 'number' || !Number.isFinite(authored)) return autoCellSize;
  return Math.min(authored, autoCellSize);
}

/** The scaled line width for one style field, used by every drawing layer. */
export function styleLineWidth(base: number, cellSize: number): number {
  return scaleLineWidth(base, cellScale(cellSize));
}

/** v0.8.7 §6 / v0.9.1 §2：画布纸片硬投影（blur=0），偏移按格百分比 × cellSize，颜色取 style.canvasShadow，alpha 固定 {@link CANVAS_SHADOW_ALPHA}。 */
export function canvasShadowStyle(style: MapStyle, cellSize: number): CSSProperties {
  const { r, g, b } = hexToRgb(style.canvasShadow.color);
  const offset = (style.canvasShadow.offset / 100) * cellSize;
  return {
    boxShadow: `${offset}px ${offset}px 0 rgba(${r}, ${g}, ${b}, ${CANVAS_SHADOW_ALPHA})`,
  };
}

/** v0.9.1 §5：物品描边。 返回 CSS `filter`； 宽度为 0（出厂默认）时返回 `undefined`， 调用方据此不挂 filter —— 零宽描边不该在 DOM 上留一条 `drop-shadow(0px 0 0 …)`。 用 4 向硬 `drop-shadow` 叠成一圈**剪影描边**：跟着物品图片的 alpha 走，透明 背景的物品得到的是一圈贴着实物的边，而不是一个矩形框。 下限 1px 保证 小格子下不会缩成 0（与 `MapGameLayers.tsx` 里清除图标白描边的 `Math.max(1, Math.round(cellSize * 0.02))` 同一处理方式）。 */
export function itemOutlineFilter(
  outline: MapStyleItemOutline,
  cellSize: number,
): string | undefined {
  if (!(outline.width > 0)) return undefined;
  const scaled = styleLineWidth(outline.width, cellSize);
  if (!(scaled > 0)) return undefined;
  const px = Math.max(1, Math.round(scaled));
  const { color: outlineColor } = outline;
  return [
    `drop-shadow(${px}px 0 0 ${outlineColor})`,
    `drop-shadow(-${px}px 0 0 ${outlineColor})`,
    `drop-shadow(0 ${px}px 0 ${outlineColor})`,
    `drop-shadow(0 -${px}px 0 ${outlineColor})`,
  ].join(' ');
}

/** 比较两个已 resolve 的 MapStyle 是否相等（调色板不在 MapStyle 内），「基本信息」抽屉用它判断是否有改动。 */
export function mapStyleEquals(a: MapStyle, b: MapStyle): boolean {
  if (a === b) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The operated row / column glyph stays `delta` px larger. */
export function rulerActiveFontSize(fontSize: number, scale: number): number {
  return scaleFontSize(fontSize + RULER_ACTIVE_FONT_DELTA, scale);
}
