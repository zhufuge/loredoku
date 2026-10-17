import {
  MAP_LAYER_Z,
  REGION_FILL_Z,
  type DraftRegion,
  type MapStyle,
} from '@loredoku/shared';
import { buildRegionEdges, buildRegionHighlightPaths } from '@/lib/region';
import { styleLineWidth } from '@/lib/mapStyle';

/**
 * v0.5.6: the region layers, split out of the old `MapLayers.tsx`.
 */

/**
 * OPT-B01 (docs/v0.3.6.md §1): the highlight hugs the **inner** side of the
 * region boundary and grows inwards, never covering it. The boundary itself
 * is a `borderWidth × scale` stroke centred on the contour, so it eats
 * `borderWidth × scale / 2` into the region; the highlight starts exactly
 * there.
 */
function regionHighlightInset(borderWidth: number, cellSize: number, highlightWidth: number): number {
  return (
    styleLineWidth(borderWidth, cellSize) / 2 + styleLineWidth(highlightWidth, cellSize) / 2
  );
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
 */
export function RegionHighlightOutline({
  cells,
  cellSize,
  borderWidth,
  style,
}: {
  cells: Array<[number, number]>;
  cellSize: number;
  /** The region's own `borderWidth`; the highlight nests inside it. */
  borderWidth: number;
  style: MapStyle;
}): JSX.Element {
  const inset = regionHighlightInset(borderWidth, cellSize, style.regionHighlight.width);
  const paths = buildRegionHighlightPaths(cells, cellSize, inset);
  const width = styleLineWidth(style.regionHighlight.width, cellSize);
  return (
    <svg className="absolute left-0 top-0" style={{ overflow: 'visible' }}>
      {paths.map((path, index) => (
        <path
          key={index}
          d={path.d}
          fill="none"
          stroke={style.regionHighlight.color}
          strokeWidth={width}
          strokeOpacity={0.9}
          strokeLinecap="butt"
          strokeLinejoin="miter"
        />
      ))}
    </svg>
  );
}

/** Region colour fill — see `REGION_FILL_Z` (docs/layer-priority.md §1). */
export function MapRegionFillLayer({
  regions,
  gridSize,
  cellSize,
}: {
  regions: DraftRegion[];
  gridSize: number;
  cellSize: number;
}): JSX.Element {
  const total = gridSize * cellSize;
  return (
    <svg
      className="pointer-events-none absolute left-0 top-0"
      width={total}
      height={total}
      style={{ zIndex: REGION_FILL_Z }}
    >
      {regions.flatMap((region) =>
        region.cells.map(([x, y]) => (
          <rect
            key={`${region.id}-${x}-${y}`}
            x={x * cellSize}
            y={y * cellSize}
            width={cellSize}
            height={cellSize}
            fill={region.color}
            fillOpacity={region.fillOpacity}
          />
        )),
      )}
    </svg>
  );
}

/**
 * 层 7 · 区域轮廓线（Region Outline）— the region's outer contour, wider than a
 * grid separator (`region.borderWidth`, 4 ~ 12px) and drawn below it so the
 * grid stays readable.
 *
 * v0.3.8 FEAT-D02: the **colour** comes from the map style
 * (`style.regionOutline.color`), so one setting tunes every region; the
 * **width** stays per-region and is initialised from `style.regionOutline.width`.
 *
 * Adjacent regions each draw their own outline, so a shared edge renders both
 * lines. Nothing is merged and no priority is applied — a thicker junction is
 * the expected result.
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
      style={{ zIndex: MAP_LAYER_Z.regionOutline }}
    >
      {regions.map((region) => {
        const selected = selectedRegionId === region.id;
        const edges = buildRegionEdges(region.cells, cellSize);
        const width = styleLineWidth(region.borderWidth + (selected ? 2 : 0), cellSize);
        return (
          <g key={region.id}>
            {edges.map((edge, index) => (
              <line
                key={index}
                x1={edge.x1}
                y1={edge.y1}
                x2={edge.x2}
                y2={edge.y2}
                stroke={style.regionOutline.color}
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
        borderWidth={region.borderWidth}
        style={style}
      />
    </div>
  );
}
