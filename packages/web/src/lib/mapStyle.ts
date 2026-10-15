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
  MAP_STYLE_REGION_LABEL_FONT_MAX,
  MAP_STYLE_REGION_LABEL_FONT_MIN,
  MAP_STYLE_REGION_LABEL_STROKE_MAX,
  MAP_STYLE_REGION_LABEL_STROKE_MIN,
  REGION_BORDER_WIDTH_MAX,
  REGION_BORDER_WIDTH_MIN,
  type CharacterSlotEntry,
  type MapLinkageColor,
  type MapStyleLine,
  type MapStyleMouseCursor,
  type MapStyleOperationCursor,
  type MapStyleRegionLabel,
  type MapStyle,
  type ParticipantTarget,
} from '@murdoku/shared';
import { cellScale, scaleLineWidth } from '@/lib/canvasScale';

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
  const border: Partial<MapStyleLine> = source.border ?? {};
  const mouseCursor: Partial<MapStyleMouseCursor> = source.mouseCursor ?? {};
  const operationCursor: Partial<MapStyleOperationCursor> = source.operationCursor ?? {};
  const regionLabel: Partial<MapStyleRegionLabel> = source.regionLabel ?? {};
  const regionBorder: Partial<MapStyleLine> = source.regionBorder ?? {};
  const regionHighlight: Partial<MapStyleLine> = source.regionHighlight ?? {};

  return {
    cellSize:
      typeof source.cellSize === 'number' && Number.isFinite(source.cellSize)
        ? clampCellSize(source.cellSize)
        : null,
    canvasFrame: {
      width: width(fallback.canvasFrame.width, canvasFrame.width),
      color: color(fallback.canvasFrame.color, canvasFrame.color),
    },
    border: {
      width: width(fallback.border.width, border.width),
      color: color(fallback.border.color, border.color),
    },
    mouseCursor: {
      width: width(fallback.mouseCursor.width, mouseCursor.width),
      color: color(fallback.mouseCursor.color, mouseCursor.color),
      blockedColor: color(fallback.mouseCursor.blockedColor, mouseCursor.blockedColor),
      shadowColor: color(fallback.mouseCursor.shadowColor, mouseCursor.shadowColor, isValidShadowColor),
    },
    operationCursor: {
      width: width(fallback.operationCursor.width, operationCursor.width),
      color: color(fallback.operationCursor.color, operationCursor.color),
      offset:
        typeof operationCursor.offset === 'number'
          ? clampOperationOffset(operationCursor.offset)
          : fallback.operationCursor.offset,
    },
    regionLabel: {
      fontSize:
        typeof regionLabel.fontSize === 'number'
          ? clampRegionLabelFont(regionLabel.fontSize)
          : fallback.regionLabel.fontSize,
      strokeWidth:
        typeof regionLabel.strokeWidth === 'number'
          ? clampRegionLabelStroke(regionLabel.strokeWidth)
          : fallback.regionLabel.strokeWidth,
      color: color(fallback.regionLabel.color, regionLabel.color),
      strokeColor: color(fallback.regionLabel.strokeColor, regionLabel.strokeColor),
      hoverFontSize:
        typeof regionLabel.hoverFontSize === 'number'
          ? clampRegionLabelFont(regionLabel.hoverFontSize)
          : fallback.regionLabel.hoverFontSize,
      hoverColor: color(fallback.regionLabel.hoverColor, regionLabel.hoverColor),
      hoverStrokeColor: color(fallback.regionLabel.hoverStrokeColor, regionLabel.hoverStrokeColor),
    },
    regionBorder: {
      // The region outline follows its own 4 ~ 12px range, not the line range.
      width:
        typeof regionBorder.width === 'number'
          ? clampRegionBorderWidth(regionBorder.width)
          : fallback.regionBorder.width,
      color: color(fallback.regionBorder.color, regionBorder.color),
    },
    regionHighlight: {
      width: width(fallback.regionHighlight.width, regionHighlight.width),
      color: color(fallback.regionHighlight.color, regionHighlight.color),
    },
    linkageColors: resolveLinkageColors(source.linkageColors),
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

/** FEAT-D04: colour lookup by palette key, falling back to the first entry. */
export function linkageColorFor(style: MapStyle, key: string): string {
  return (
    style.linkageColors.find((entry) => entry.key === key)?.color ??
    style.linkageColors[0]?.color ??
    DEFAULT_MAP_STYLE.linkageColors[0]!.color
  );
}

export function linkageLabelFor(style: MapStyle, key: string): string {
  return (
    style.linkageColors.find((entry) => entry.key === key)?.label ??
    style.linkageColors[0]?.label ??
    key
  );
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
