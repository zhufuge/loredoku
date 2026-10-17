/** MOD-702 (docs/v0.3.2.md): `**bold**` → `{ text, bold: true }` segments; unclosed `**` stays literal. */

export interface ClueSegment {
  text: string;
  bold: boolean;
}

/**
 * Splits a clue into bold / normal segments: `'a**b**c'` → a, b(bold), c;
 * `'un**closed'` → one literal segment; `'**a**b**c**'` → a(bold), b, c(bold).
 */
export function parseClue(clue: string): ClueSegment[] {
  if (!clue) return [];

  const segments: ClueSegment[] = [];
  let remaining = clue;
  let bold = false;

  while (remaining.length > 0) {
    const markerIndex = remaining.indexOf('**');
    if (markerIndex === -1) {
      // No more markers — rest is literal
      if (remaining.length > 0) {
        segments.push({ text: remaining, bold });
      }
      break;
    }
    // Text before the marker
    const before = remaining.slice(0, markerIndex);
    if (before.length > 0) {
      segments.push({ text: before, bold });
    }
    bold = !bold;
    remaining = remaining.slice(markerIndex + 2);
  }

  // If we ended in bold state, the last unclosed ** was literal.
  if (bold) {
    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = segments[i];
      if (seg && seg.bold) {
        const text = seg.text;
        segments.splice(i, 1);
        segments.push({ text: `${text}**`, bold: false });
        break;
      }
    }
  }

  return segments;
}

/**
 * Inline rendering: renders segments as React children.
 * Bold segments get `font-weight: 700`.
 */
export function renderClueSegments(segments: ClueSegment[]): Array<{ text: string; bold: boolean }> {
  return segments;
}

/** Truncates clue text for display (2 lines on the participant box). */
export function truncateClue(clue: string, maxLen = 40): string {
  if (clue.length <= maxLen) return clue;
  return clue.slice(0, maxLen) + '…';
}