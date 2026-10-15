import { describe, expect, it } from 'vitest';

/**
 * FIX-D01 (docs/v0.3.8.md §1) — a **source-level** regression guard.
 *
 * The v0.3.7 fix shipped `buildRegionInnerEdges` in `lib/region.ts` but never
 * wired it into the renderer, so the "region highlight renders as diagonal
 * lines" bug survived a whole version with a green unit-test suite. These
 * assertions read the component source so the same "wrote the function but
 * forgot to call it" mistake cannot pass unnoticed again.
 */
const raw = import.meta.glob('./MapLayers.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** Normalise CRLF so the multi-line markers below match on any platform. */
const source = (raw['./MapLayers.tsx'] ?? '').replace(/\r\n/g, '\n');

function segment(haystack: string, startMarker: string, endMarker: string): string {
  const start = haystack.indexOf(startMarker);
  const end = haystack.indexOf(endMarker, start);
  if (start === -1 || end === -1) {
    throw new Error(`segment not found (start="${startMarker}", end="${endMarker}")`);
  }
  return haystack.slice(start, end);
}

describe('region highlight wiring (FIX-D01)', () => {
  it('finds the component source', () => {
    expect(source.length).toBeGreaterThan(0);
  });

  it('imports and calls the pure geometry helper', () => {
    expect(source).toContain('buildRegionInnerEdges');
    expect(source).toContain('buildRegionInnerEdges(cells, cellSize, inset)');
  });

  it('no longer shifts endpoints by hand inside RegionInnerBorder', () => {
    const body = segment(source, 'function RegionInnerBorder(', '\n/**\n * 边框 border');
    // The old bug: a constant axis shifted on one end only.
    expect(body).not.toContain('edge.x1 + inset');
    expect(body).not.toContain('edge.y1 + inset');
    expect(body).not.toMatch(/x2=\{edge\.x2 - /);
    expect(body).not.toMatch(/y2=\{edge\.y2 - /);
    // Geometry comes from the helper, in one place.
    expect(body).toContain('buildRegionInnerEdges(');
  });

  it('keeps square caps so corners do not overflow', () => {
    const body = segment(source, 'function RegionInnerBorder(', '\n/**\n * 边框 border');
    expect(body).toContain('strokeLinecap="square"');
    expect(body).not.toContain('strokeLinecap="round"');
  });

  it('FEAT-D02: the highlight colour and width come from the map style', () => {
    const body = segment(source, 'function RegionInnerBorder(', '\n/**\n * 边框 border');
    expect(body).toContain('style.regionHighlight.color');
    expect(body).toContain('style.regionHighlight.width');
  });
});
