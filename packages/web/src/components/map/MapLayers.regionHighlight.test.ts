import { describe, expect, it } from 'vitest';
import { readSource, segment } from '@/testing/source';

/**
 * FIX-D01 (docs/v0.3.8.md §1) + FIX-E02 (docs/v0.3.9.md §2) — a **source-level**
 * regression guard for the region highlight.
 *
 * History:
 * - v0.3.7 shipped `buildRegionInnerEdges` but never called it → the highlight
 *   stayed diagonal for a whole version while the unit tests were green.
 * - v0.3.8 wired it up, but the per-cell-edge inset still left a gap at every
 *   cell boundary and every concave corner → the highlight looked dashed.
 *
 * These assertions read the component source so neither regression can come
 * back unnoticed.
 */
const source = readSource('components/map/MapLayers.tsx');

describe('region highlight wiring (FIX-D01 + FIX-E02)', () => {
  it('imports and calls the pure geometry helper', () => {
    expect(source).toContain('buildRegionHighlightPaths');
    expect(source).toContain('buildRegionHighlightPaths(cells, cellSize, inset)');
  });

  it('FIX-E02: renders one closed path per loop, not one line per cell edge', () => {
    const body = segment(source, 'function RegionHighlightOutline(', '\n/**\n * 层 6 · 网格分隔线');
    expect(body).toContain('<path');
    expect(body).toContain('d={path.d}');
    // The per-cell-edge approach is what produced the gaps.
    expect(body).not.toContain('<line');
  });

  it('FIX-D01: no hand-written endpoint arithmetic inside the component', () => {
    const body = segment(source, 'function RegionHighlightOutline(', '\n/**\n * 层 6 · 网格分隔线');
    expect(body).not.toContain('edge.x1 + inset');
    expect(body).not.toContain('edge.y1 + inset');
    expect(body).not.toMatch(/x2=\{edge\.x2 - /);
    expect(body).not.toMatch(/y2=\{edge\.y2 - /);
  });

  it('joins corners with miters and keeps butt caps', () => {
    const body = segment(source, 'function RegionHighlightOutline(', '\n/**\n * 层 6 · 网格分隔线');
    expect(body).toContain('strokeLinejoin="miter"');
    expect(body).toContain('strokeLinecap="butt"');
    expect(source).not.toContain('strokeLinecap="round"');
  });

  it('FEAT-D02: the highlight colour and width come from the map style', () => {
    const body = segment(source, 'function RegionHighlightOutline(', '\n/**\n * 层 6 · 网格分隔线');
    expect(body).toContain('style.regionHighlight.color');
    expect(body).toContain('style.regionHighlight.width');
  });
});

describe('layer z-index keys (SPEC-E01)', () => {
  // `canvasBase`（画布底色）is painted by EditorCanvas itself, not by this file.
  it('uses the规范 layer names from docs/layer-priority.md §1', () => {
    for (const key of [
      'mouseCursorBox',
      'operationCursorBox',
      'objectLayer',
      'gridSeparator',
      'regionOutline',
      'nonStandableMask',
      'backgroundLayer',
    ]) {
      expect(source, key).toContain(`MAP_LAYER_Z.${key}`);
    }
  });

  it('no longer references the pre-v0.3.9 key names', () => {
    for (const key of [
      'MAP_LAYER_Z.cellMouseCursor',
      'MAP_LAYER_Z.cellOperationCursor',
      'MAP_LAYER_Z.gridBorder',
      'MAP_LAYER_Z.regionEdge',
      'MAP_LAYER_Z.noStandShadow',
      'MAP_LAYER_Z.emptyCell',
    ]) {
      expect(source, key).not.toContain(key);
    }
  });
});
