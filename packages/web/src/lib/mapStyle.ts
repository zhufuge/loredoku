import {
  DEFAULT_LINKAGE_COLORS,
  DEFAULT_MAP_STYLE,
  LINKAGE_COLOR_KEY_PATTERN,
  LINKAGE_COLOR_LABEL_MAX_LENGTH,
  LINKAGE_COLOR_MAX_COUNT,
  LINKAGE_COLOR_MIN_COUNT,
  MAP_STYLE_CELL_SIZE_MAX,
  MAP_STYLE_CELL_SIZE_MIN,
  MAP_STYLE_COLOR_PATTERN,
  MAP_STYLE_LINE_WIDTH_MAX,
  MAP_STYLE_LINE_WIDTH_MIN,
  MAP_STYLE_OPERATION_OFFSET_MAX,
  MAP_STYLE_OPERATION_OFFSET_MIN,
  MAP_STYLE_RULER_FONT_MAX,
  MAP_STYLE_RULER_FONT_MIN,
  MAP_STYLE_RULER_GAP_MAX,
  MAP_STYLE_RULER_GAP_MIN,
  MAP_STYLE_REGION_LABEL_FONT_MAX,
  MAP_STYLE_REGION_LABEL_FONT_MIN,
  MAP_STYLE_REGION_LABEL_STROKE_MAX,
  MAP_STYLE_REGION_LABEL_STROKE_MIN,
  REGION_BORDER_WIDTH_MAX,
  REGION_BORDER_WIDTH_MIN,
  RULER_ACTIVE_FONT_DELTA,
  type CharacterSlotEntry,
  type MapLinkageColor,
  type MapStyleLine,
  type MapStyleMouseCursorBox,
  type MapStyleOperationCursorBox,
  type MapStyleRegionLabel,
  type MapStyleRuler,
  type MapStyle,
  type ParticipantTarget,
} from '@loredoku/shared';
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

export function clampOperationOffset(value: number): number {
  return clampNumber(value, MAP_STYLE_OPERATION_OFFSET_MIN, MAP_STYLE_OPERATION_OFFSET_MAX);
}

/** v0.3.9 FEAT-E02: ruler text size (integer px). */
export function clampRulerFontSize(value: number): number {
  return Math.round(clampNumber(value, MAP_STYLE_RULER_FONT_MIN, MAP_STYLE_RULER_FONT_MAX));
}

/** v0.3.9 FEAT-E02: gap between the ruler text and the board. */
export function clampRulerGap(value: number): number {
  return clampNumber(value, MAP_STYLE_RULER_GAP_MIN, MAP_STYLE_RULER_GAP_MAX);
}

export function clampRegionBorderWidth(value: number): number {
  return Math.round(clampNumber(value, REGION_BORDER_WIDTH_MIN, REGION_BORDER_WIDTH_MAX));
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
 * FEAT-D03: the effective cell width at 100% zoom. An explicit `cellSize`
 * override wins; otherwise the adaptive pass's value is used as-is.
 */
export function effectiveCellSize(autoCellSize: number, style: MapStyle): number {
  return style.cellSize ?? autoCellSize;
}

/** The scaled line width for one style field, used by every drawing layer. */
export function styleLineWidth(base: number, cellSize: number): number {
  return scaleLineWidth(base, cellScale(cellSize));
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
