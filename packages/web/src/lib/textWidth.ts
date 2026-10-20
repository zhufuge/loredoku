/**
 * The shared glyph-width **model** — an estimate, good enough to decide
 * whether text still fits a box.
 *
 * A wide (CJK / fullwidth) glyph counts as a full em, everything else as
 * ~0.62em. v0.6.4 introduced the model for `glyphFontSize` (participant
 * 编号 in the 9-grid); v0.7.0 reuses it for the ruler strips, whose thin
 * axis has to fit the `C24` / `R24` label *width*, not just its height.
 */
export function textEmUnits(text: string): number {
  let units = 0;
  for (const char of text) {
    units += (char.codePointAt(0) ?? 0) >= 0x2e80 ? 1 : 0.62;
  }
  return units;
}

/** Estimated rendered width of `text` at `fontSize`. */
export function estimateTextWidth(text: string, fontSize: number): number {
  if (!Number.isFinite(fontSize) || fontSize <= 0) return 0;
  return textEmUnits(text) * fontSize;
}
