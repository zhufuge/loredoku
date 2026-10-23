import type {
  MapStyle,
  RegionLabelStyle,
  RegionLineStyle,
  RegionStyle,
  RegionStyleOverride,
} from '@loredoku/shared';
import { isMapStyleFontFamilyName } from '@loredoku/shared';
import {
  clampLineWidth,
  clampRegionBorderWidth,
  clampRegionLabelFont,
  clampRegionLabelStroke,
  isValidStyleColor,
} from './mapStyle';

/**
 * v0.7.0 (docs/v0.7.0.md §4) — a region's own display style.
 *
 * The map-level block (`MapStyle.regionOutline` / `regionHighlight` /
 * `regionLabel`) is the **default**; a region stores only what differs from it
 * (`DraftRegion.style`, a deep partial). {@link resolveRegionStyle} is the
 * single place that merges the two, so every renderer reads resolved values and
 * never defends itself against a half-filled override.
 *
 * The reverse direction, {@link regionStyleOverride}, is what the editor calls
 * on save: a field equal to the map default is **not recorded**, so a region
 * that agrees with the defaults everywhere carries no `style` key at all.
 */

function pickColor(fallback: string, value: unknown): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return isValidStyleColor(trimmed) ? trimmed : fallback;
}

/** Merges a region's override over the map-level defaults, clamping as it goes. */
export function resolveRegionStyle(
  base: MapStyle,
  override?: RegionStyleOverride | null,
): RegionStyle {
  const outline: Partial<RegionLineStyle> = override?.outline ?? {};
  const highlight: Partial<RegionLineStyle> = override?.highlight ?? {};
  const label: Partial<RegionLabelStyle> = override?.label ?? {};

  const fontSize =
    typeof label.fontSize === 'number'
      ? clampRegionLabelFont(label.fontSize)
      : base.regionLabel.fontSize;

  return {
    outline: {
      // The region outline follows its own 4 ~ 12px range, not the line range.
      width:
        typeof outline.width === 'number'
          ? clampRegionBorderWidth(outline.width)
          : base.regionOutline.width,
      color: pickColor(base.regionOutline.color, outline.color),
    },
    highlight: {
      width:
        typeof highlight.width === 'number'
          ? clampLineWidth(highlight.width)
          : base.regionHighlight.width,
      color: pickColor(base.regionHighlight.color, highlight.color),
    },
    label: {
      // v0.7.4: the typeface is a font name, so the only failure mode is a
      // malformed name — that falls back to the map-level value, not to the
      // shipped default. A name this build does not ship is still honoured:
      // the renderer quotes it and lets the browser walk the fallback chain.
      fontFamily:
        label.fontFamily !== undefined && isMapStyleFontFamilyName(label.fontFamily)
          ? label.fontFamily
          : base.regionLabel.fontFamily,
      fontSize,
      strokeWidth:
        typeof label.strokeWidth === 'number'
          ? clampRegionLabelStroke(label.strokeWidth)
          : base.regionLabel.strokeWidth,
      color: pickColor(base.regionLabel.color, label.color),
      strokeColor: pickColor(base.regionLabel.strokeColor, label.strokeColor),
      // v0.5.2 FIX-M02: the hovered label is **never smaller** than the idle
      // one — measured against the resolved fontSize, so a region that only
      // grows its own label cannot end up with a smaller hovered one.
      hoverFontSize: Math.max(
        fontSize,
        typeof label.hoverFontSize === 'number'
          ? clampRegionLabelFont(label.hoverFontSize)
          : base.regionLabel.hoverFontSize,
      ),
      hoverColor: pickColor(base.regionLabel.hoverColor, label.hoverColor),
      hoverStrokeColor: pickColor(base.regionLabel.hoverStrokeColor, label.hoverStrokeColor),
      hoverStrokeWidth:
        typeof label.hoverStrokeWidth === 'number'
          ? clampRegionLabelStroke(label.hoverStrokeWidth)
          : base.regionLabel.hoverStrokeWidth,
    },
  };
}

/**
 * The minimal override that reproduces `style` on top of `base`: only fields
 * that differ are kept. Returns `undefined` when nothing differs — the caller
 * then stores no `style` key at all.
 */
export function regionStyleOverride(
  style: RegionStyle,
  base: MapStyle,
): RegionStyleOverride | undefined {
  const outline: Partial<RegionLineStyle> = {};
  if (style.outline.width !== base.regionOutline.width) {
    outline.width = style.outline.width;
  }
  if (style.outline.color !== base.regionOutline.color) {
    outline.color = style.outline.color;
  }

  const highlight: Partial<RegionLineStyle> = {};
  if (style.highlight.width !== base.regionHighlight.width) {
    highlight.width = style.highlight.width;
  }
  if (style.highlight.color !== base.regionHighlight.color) {
    highlight.color = style.highlight.color;
  }

  const label: Partial<RegionLabelStyle> = {};
  if (style.label.fontFamily !== base.regionLabel.fontFamily) {
    label.fontFamily = style.label.fontFamily;
  }
  if (style.label.fontSize !== base.regionLabel.fontSize) {
    label.fontSize = style.label.fontSize;
  }
  if (style.label.strokeWidth !== base.regionLabel.strokeWidth) {
    label.strokeWidth = style.label.strokeWidth;
  }
  if (style.label.color !== base.regionLabel.color) {
    label.color = style.label.color;
  }
  if (style.label.strokeColor !== base.regionLabel.strokeColor) {
    label.strokeColor = style.label.strokeColor;
  }
  if (style.label.hoverFontSize !== base.regionLabel.hoverFontSize) {
    label.hoverFontSize = style.label.hoverFontSize;
  }
  if (style.label.hoverColor !== base.regionLabel.hoverColor) {
    label.hoverColor = style.label.hoverColor;
  }
  if (style.label.hoverStrokeColor !== base.regionLabel.hoverStrokeColor) {
    label.hoverStrokeColor = style.label.hoverStrokeColor;
  }
  if (style.label.hoverStrokeWidth !== base.regionLabel.hoverStrokeWidth) {
    label.hoverStrokeWidth = style.label.hoverStrokeWidth;
  }

  const override: RegionStyleOverride = {};
  if (Object.keys(outline).length > 0) override.outline = outline;
  if (Object.keys(highlight).length > 0) override.highlight = highlight;
  if (Object.keys(label).length > 0) override.label = label;
  return Object.keys(override).length > 0 ? override : undefined;
}

/**
 * Round-trip guard used by the tests and the editor's dirty check: resolving an
 * override and re-deriving it must land back on the same override.
 */
export function regionStyleEquals(a: RegionStyle, b: RegionStyle): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
