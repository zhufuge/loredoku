/**
 * Colour helpers shared by the zod schemas (server-side validation) and the
 * editor UI (theme colour picker) — docs/v0.3.0.md FEAT-502.
 */
import {
  THEME_COLOR_BLUE_HUE_MAX,
  THEME_COLOR_BLUE_HUE_MIN,
  THEME_COLOR_BLUE_MIN_SATURATION,
  THEME_COLOR_BLUE_MIN_VALUE,
} from './constants';

export interface Hsv {
  h: number;
  s: number;
  v: number;
}

export function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

/** Accepts `#RGB` and `#RRGGBB` (case-insensitive) and normalises to `#RRGGBB`. */
export function normalizeHexColor(value: string): string | null {
  const raw = value.trim();
  const withHash = raw.startsWith('#') ? raw : `#${raw}`;
  if (/^#[0-9a-fA-F]{3}$/.test(withHash)) {
    const [, r, g, b] = withHash;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  if (/^#[0-9a-fA-F]{6}$/.test(withHash)) {
    return withHash.toUpperCase();
  }
  return null;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = normalizeHexColor(hex) ?? '#000000';
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
}

export function hexToHsv(hex: string): Hsv {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  return { h, s: max === 0 ? 0 : delta / max, v: max };
}

/**
 * Blue hues are reserved for the highlight effect, so a participant theme
 * colour may not be blue (docs/v0.3.0.md §2.2.3).
 */
export function isReservedBlueColor(hex: string): boolean {
  if (!isHexColor(hex.trim()) && !/^#[0-9a-fA-F]{3}$/.test(hex.trim())) return false;
  const { h, s, v } = hexToHsv(hex);
  if (h < THEME_COLOR_BLUE_HUE_MIN || h > THEME_COLOR_BLUE_HUE_MAX) return false;
  return s >= THEME_COLOR_BLUE_MIN_SATURATION && v >= THEME_COLOR_BLUE_MIN_VALUE;
}

/** Relative luminance (0…1) used to pick readable text on a theme swatch. */
export function hexLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

export function isDarkColor(hex: string): boolean {
  return hexLuminance(hex) < 0.5;
}
