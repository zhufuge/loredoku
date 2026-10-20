import type { MapStyle } from '@loredoku/shared';
import { MAP_LAYER_Z } from '@loredoku/shared';
import { styleLineWidth } from '@/lib/mapStyle';

/**
 * the grid chrome layers, split out of the old `MapLayers.tsx`.
 *
 * 层 6 · 网格分隔线（Grid Separator）: adjacent cells **share** one separator,
 * so an `n × n` board draws `n-1` lines per axis — never four lines per cell.
 * The board outline is a separate layer (see {@link MapCanvasFrameLayer}).
 *
 * Width and colour come from `style.gridSeparator`; the
 * width is a base value and is still multiplied by `cellSize / BASE_CELL`.
 */
export function MapGridSeparatorLayer({
  gridSize,
  cellSize,
  style,
}: {
  gridSize: number;
  cellSize: number;
  style: MapStyle;
}): JSX.Element {
  const total = gridSize * cellSize;
  const width = styleLineWidth(style.gridSeparator.width, cellSize);
  const lines: JSX.Element[] = [];
  for (let i = 1; i < gridSize; i += 1) {
    const pos = i * cellSize;
    lines.push(
      <line
        key={`grid-v-${i}`}
        x1={pos}
        y1={0}
        x2={pos}
        y2={total}
        stroke={style.gridSeparator.color}
        strokeWidth={width}
      />,
      <line
        key={`grid-h-${i}`}
        x1={0}
        y1={pos}
        x2={total}
        y2={pos}
        stroke={style.gridSeparator.color}
        strokeWidth={width}
      />,
    );
  }
  return (
    <svg
      className="pointer-events-none absolute left-0 top-0"
      width={total}
      height={total}
      style={{ zIndex: MAP_LAYER_Z.gridSeparator }}
    >
      {lines}
    </svg>
  );
}

/**
 * 层 5 · 画布外框（Canvas Frame）: the board's outermost frame.
 *
 * v0.7.0 (docs/v0.7.0.md §3): the stroke is **centred on the canvas boundary**,
 * exactly like the internal separators — so the grid's outermost line and the
 * canvas frame are one and the same line (「网格框最外描边线 = 画布外框」). Half
 * the stroke therefore falls inside the board, which is why the SVG still needs
 * `overflow: visible`.
 *
 * This is the outer frame only; the lines *between* cells are 网格分隔线
 * ({@link MapGridSeparatorLayer}). Width and colour come from
 * `style.canvasFrame`.
 */
export function MapCanvasFrameLayer({
  gridSize,
  cellSize,
  style,
}: {
  gridSize: number;
  cellSize: number;
  style: MapStyle;
}): JSX.Element {
  const total = gridSize * cellSize;
  const width = styleLineWidth(style.canvasFrame.width, cellSize);
  return (
    <svg
      className="pointer-events-none absolute left-0 top-0"
      width={total}
      height={total}
      style={{ overflow: 'visible', zIndex: MAP_LAYER_Z.canvasFrame }}
    >
      <rect
        x={0}
        y={0}
        width={total}
        height={total}
        fill="none"
        stroke={style.canvasFrame.color}
        strokeWidth={width}
      />
    </svg>
  );
}
