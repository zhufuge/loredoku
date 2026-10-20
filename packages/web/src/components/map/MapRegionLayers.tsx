import {
  MAP_LAYER_Z,
  type DraftRegion,
  type MapStyle,
  type RegionStyle,
} from '@loredoku/shared';
import { buildRegionEdges, buildRegionHighlightPaths } from '@/lib/region';
import { styleLineWidth } from '@/lib/mapStyle';
import { resolveRegionStyle } from '@/lib/regionStyle';

/**
 * the region layers, split out of the old `MapLayers.tsx`.
 *
 * v0.7.0 (docs/v0.7.0.md §4): a region carries only the **differences** from
 * the map-level defaults (`DraftRegion.style`), so every layer resolves its own
 * values through `resolveRegionStyle`. The v0.6.x fill layer is gone — 填充
 * retired together with the region's `color` / `fillOpacity`.
 */

/**
 * OPT-B01 (docs/v0.3.6.md §1): the highlight hugs the **inner** side of the
 * region boundary and grows inwards, never covering it. The boundary itself
 * is a `outline.width × scale` stroke centred on the contour, so it eats
 * `outline.width × scale / 2` into the region; the highlight starts exactly
 * there.
 */
function regionHighlightInset(
  outlineWidth: number,
  cellSize: number,
  highlightWidth: number,
): number {
  return styleLineWidth(outlineWidth, cellSize) / 2 + styleLineWidth(highlightWidth, cellSize) / 2;
}

/**
 * 区域高亮线（Region Highlight）— FIX-E02 (docs/v0.3.9.md §2).
 *
 * The outline is produced by `buildRegionHighlightPaths`, which traces the
 * region's closed rectilinear contour and offsets each supporting line inward
 * by `inset`. Rendering one closed `<path>` per loop is what makes the highlight
 * **continuous**: the v0.3.8 implementation drew one independently inset
 * segment per cell edge, leaving a gap at every cell boundary and every
 * concave corner.
 */
/**
 * Exported for {@link MapHighlightLayer} (`MapOverlayLayers.tsx`), which draws
 * the same continuous outline for linkage-targeted regions.
 *
 * v0.7.0: takes the region's **resolved** style — the highlight width / colour
 * and the outline width the inset nests inside may all be region-specific.
 */
export function RegionHighlightOutline({
  cells,
  cellSize,
  regionStyle,
}: {
  cells: Array<[number, number]>;
  cellSize: number;
  /** The region's resolved style (map defaults + its own overrides). */
  regionStyle: RegionStyle;
}): JSX.Element {
  const inset = regionHighlightInset(
    regionStyle.outline.width,
    cellSize,
    regionStyle.highlight.width,
  );
  const paths = buildRegionHighlightPaths(cells, cellSize, inset);
  const width = styleLineWidth(regionStyle.highlight.width, cellSize);
  return (
    <svg className="absolute left-0 top-0" style={{ overflow: 'visible' }}>
      {paths.map((path, index) => (
        <path
          key={index}
          d={path.d}
          fill="none"
          stroke={regionStyle.highlight.color}
          strokeWidth={width}
          strokeOpacity={0.9}
          strokeLinecap="butt"
          strokeLinejoin="miter"
        />
      ))}
    </svg>
  );
}

/**
 * 层 7 · 区域轮廓线（Region Outline）— the region's outer contour, wider than a
 * grid separator (4 ~ 12px) and drawn above the canvas frame / grid lines so a
 * region boundary is never cut into dashes; only item artwork still sits on top.
 *
 * v0.7.0 (docs/v0.7.0.md §4): **both** the width and the colour come from the
 * region's resolved style — the map-level block is the default, the region's
 * own `style.outline` overrides it. (The v0.6.x split, map colour + per-region
 * width, is gone with the flat `color` field.)
 *
 * Adjacent regions each draw their own outline, so a shared edge renders both
 * lines. Nothing is merged and no priority is applied — a thicker junction is
 * the expected result.
 *
 * `overflow: visible` is required, not cosmetic: the stroke is centred on the
 * contour, so an edge lying on the board boundary (`x = 0` / `total`) puts half
 * its width outside the SVG viewport. Without it the browser clips that half
 * and the boundary edge renders as a half-width line that no longer matches the
 * rest of the contour — the canvas frame solves the same problem the same way.
 */
export function MapRegionOutlineLayer({
  regions,
  gridSize,
  cellSize,
  style,
  selectedRegionId = null,
}: {
  regions: DraftRegion[];
  gridSize: number;
  cellSize: number;
  style: MapStyle;
  selectedRegionId?: string | null;
}): JSX.Element {
  const total = gridSize * cellSize;
  return (
    <svg
      className="pointer-events-none absolute left-0 top-0"
      width={total}
      height={total}
      style={{ overflow: 'visible', zIndex: MAP_LAYER_Z.regionOutline }}
    >
      {regions.map((region) => {
        const selected = selectedRegionId === region.id;
        const resolved = resolveRegionStyle(style, region.style);
        const edges = buildRegionEdges(region.cells, cellSize);
        const width = styleLineWidth(resolved.outline.width + (selected ? 2 : 0), cellSize);
        return (
          <g key={region.id}>
            {edges.map((edge, index) => (
              <line
                key={index}
                x1={edge.x1}
                y1={edge.y1}
                x2={edge.x2}
                y2={edge.y2}
                stroke={resolved.outline.color}
                strokeOpacity={1}
                strokeWidth={width}
                strokeLinecap="square"
                strokeLinejoin="miter"
              />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * 层 9 · 区域高亮线（Region Highlight）— the inner highlight shown while a
 * region is hovered or targeted by a linkage. Geometry comes from
 * {@link RegionHighlightOutline}, so the outline is always continuous.
 */
export function MapRegionHighlightLayer({
  region,
  cellSize,
  style,
}: {
  region: DraftRegion | null;
  cellSize: number;
  style: MapStyle;
}): JSX.Element | null {
  if (!region) return null;
  return (
    <div
      className="pointer-events-none absolute left-0 top-0"
      style={{ zIndex: MAP_LAYER_Z.regionHighlight }}
    >
      <RegionHighlightOutline
        cells={region.cells}
        cellSize={cellSize}
        regionStyle={resolveRegionStyle(style, region.style)}
      />
    </div>
  );
}
