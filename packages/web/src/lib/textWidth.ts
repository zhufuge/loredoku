/** The shared glyph-width **model** — an estimate, good enough to decide whether text still fits a box. */
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
