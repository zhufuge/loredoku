import type { MapStyle } from '@loredoku/shared';
import { MAP_LAYER_Z } from '@loredoku/shared';
import { styleLineWidth } from '@/lib/mapStyle';

/** 层 6 · 网格分隔线：相邻格共用一条线（n×n 画 n-1 条/轴）；线宽按 cellSize / BASE_CELL 缩放；外框见 {@link MapCanvasFrameLayer}。 */
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

/** 层 5 · 画布外框：描边以画布边界为中心，与外圈网格线重合，故 SVG 需 overflow: visible；线宽/颜色取 style.canvasFrame。 */
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
