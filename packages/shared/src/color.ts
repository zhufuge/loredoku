/** Colour helpers shared by the zod schemas (server-side validation) and the editor UI (theme colour picker) — docs/v0.3.0.md FEAT-502. 任何合法 hex 都接受：MOD-710 去掉蓝色限制，MOD-801 去掉高亮度警告（docs/v0.3.2.md / docs/v0.3.3.md）。 */

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

