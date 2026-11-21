import {
  MAP_LAYER_Z,
  type DraftRegion,
  type MapStyle,
  type RegionStyle,
} from '@loredoku/shared';
import { buildRegionEdges, buildRegionHighlightPaths } from '@/lib/region';
import { styleLineWidth } from '@/lib/mapStyle';
import { resolveRegionStyle } from '@/lib/regionStyle';

/** 区域各层；区域只带相对地图默认的差异，故一律经 `resolveRegionStyle` 解析（docs/v0.7.0.md §4）。 */

/** OPT-B01（docs/v0.3.6.md §1）：高亮贴边界内侧 —— 边界线居中描边吃掉半宽，高亮从此处起算。 */
function regionHighlightInset(
  outlineWidth: number,
  cellSize: number,
  highlightWidth: number,
): number {
  return styleLineWidth(outlineWidth, cellSize) / 2 + styleLineWidth(highlightWidth, cellSize) / 2;
}

/** 每个闭合环渲一条整 path 才连续（FIX-E02，docs/v0.3.9.md §2）；`MapHighlightLayer` 复用，需传已解析 style。 */
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

/** `overflow: visible` 必须：描边居中于轮廓，贴板边那半宽否则被裁成半宽线；相邻区域各画各的，共边双线是预期。 */
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

/** 层 9 · 悬停 / 联动高亮；几何取自 {@link RegionHighlightOutline}，轮廓必连续。 */
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
