import type { CSSProperties } from 'react';
import {
  MAP_LAYER_Z,
  BLOCKING_SHADOW_COLOR,
  fontFamilyStack,
  type CellCoord,
  type DraftRegion,
  type MapStyle,
} from '@loredoku/shared';
import { cellCursorShadow, operationCursorStyle } from '@/lib/canvasLayers';
import { cellScale, scaleFontSize } from '@/lib/canvasScale';
import { HIGHLIGHT_FADEOUT_MS, type HighlightState } from '@/lib/highlight';
import { styleLineWidth } from '@/lib/mapStyle';
import { computeLabelCell, labelRowCenterX } from '@/lib/region';
import { resolveRegionStyle } from '@/lib/regionStyle';
import { cellRectStyle, parseKey } from './layerGeometry';
import { RegionHighlightOutline } from './MapRegionLayers';

/** 层 8 · 阻挡遮罩：在轮廓线之下、高亮线之上（docs/layer-priority.md §2）；内缩到格线，不压线。 */
export function MapBlockingMaskLayer({
  blockingCells,
  cellSize,
  style,
}: {
  blockingCells: Set<string>;
  cellSize: number;
  style: MapStyle;
}): JSX.Element | null {
  if (blockingCells.size === 0) return null;
  const inset = styleLineWidth(style.gridSeparator.width, cellSize) / 2;
  const size = Math.max(0, cellSize - inset * 2);
  return (
    <div
      className="pointer-events-none absolute left-0 top-0"
      style={{ zIndex: MAP_LAYER_Z.blockingMask }}
    >
      {[...blockingCells].map((key) => {
        const [x, y] = parseKey(key);
        return (
          <div
            key={`nostand-${key}`}
            className="absolute"
            style={{
              left: x * cellSize + inset,
              top: y * cellSize + inset,
              width: size,
              height: size,
              backgroundColor: BLOCKING_SHADOW_COLOR,
            }}
          />
        );
      })}
    </div>
  );
}

/** 层 1 · 鼠标光标框：跟指针，盘面最上层；宽度、颜色、阴影取自 `style.mouseCursorBox`。 */
export function MapMouseCursorBoxLayer({
  cell,
  blocked,
  cellSize,
  style,
}: {
  cell: CellCoord | null;
  blocked: boolean;
  cellSize: number;
  style: MapStyle;
}): JSX.Element | null {
  if (!cell) return null;
  return (
    <div
      className="pointer-events-none absolute left-0 top-0"
      style={{ zIndex: MAP_LAYER_Z.mouseCursorBox }}
    >
      <div
        className="absolute"
        style={{
          ...cellRectStyle(cell.x, cell.y, cellSize),
          boxShadow: cellCursorShadow(blocked, cellSize, style.mouseCursorBox, style.gridSeparator.width),
        }}
      />
    </div>
  );
}

/** 层 2 · 操作光标框：画在格线外侧，与鼠标框同格时鼠标线读作内线。 */
export function MapOperationCursorBoxLayer({
  cell,
  cellSize,
  style,
}: {
  cell: CellCoord | null;
  cellSize: number;
  style: MapStyle;
}): JSX.Element | null {
  if (!cell) return null;
  return (
    <div
      className="pointer-events-none absolute left-0 top-0"
      style={{ zIndex: MAP_LAYER_Z.operationCursorBox }}
    >
      <div
        className="absolute"
        style={{
          ...cellRectStyle(cell.x, cell.y, cellSize),
          ...operationCursorStyle(cellSize, style.operationCursorBox),
        }}
      />
    </div>
  );
}

/** 没有联动高亮时的空清单 —— 免得每次渲染都造一个 `[]`。 */
const NO_HIGHLIGHTED_REGIONS: readonly string[] = [];

/** 层 3 · 区域标签：读每块区域已解析的样式，逐区域的 `fontFamily` 才生效。 */
export function MapRegionLabelLayer({
  regions,
  cellSize,
  style,
  hoveredRegionId = null,
  highlightedRegionIds = NO_HIGHLIGHTED_REGIONS,
  onHover,
  onSelect,
}: {
  regions: DraftRegion[];
  cellSize: number;
  style: MapStyle;
  hoveredRegionId?: string | null;
  /** 联动高亮命中的区域 id；与悬停同一套样式 —— 都是「正被指着」。 */
  highlightedRegionIds?: readonly string[];
  onHover?: (id: string | null) => void;
  onSelect?: (id: string) => void;
}): JSX.Element {
  const scale = cellScale(cellSize);
  return (
    <div
      className="pointer-events-none absolute left-0 top-0"
      style={{ zIndex: MAP_LAYER_Z.regionLabel }}
    >
      {regions.map((region) => {
        const anchor = region.labelCell ?? computeLabelCell(region.cells);
        if (!anchor) return null;
        /* 横坐标取锚点行内本区域格子的像素跨度中点，非格心 —— 底部行偶数格时格心会右偏半格。 */
        const centerX = labelRowCenterX(region.cells, anchor[1]) ?? anchor[0] + 0.5;
        const hovered = hoveredRegionId === region.id;
        /** 悬停与联动高亮是同一件事 —— 这块区域正被指着，标题就亮。 */
        const lit = hovered || highlightedRegionIds.includes(region.id);
        const resolved = resolveRegionStyle(style, region.style);
        const label = resolved.label;
        /* 位置偏移单位是格的百分比（100 = 一格），乘格子尺寸即像素；随父层 transform，缩放不必另算。 */
        const offset = resolved.labelOffset;
        const offsetX = (offset.x / 100) * cellSize;
        const offsetY = (offset.y / 100) * cellSize;
        const strokeWidth = styleLineWidth(label.strokeWidth, cellSize);
        /* 标签不接管点击（冒泡给画布按 `clientToCell` 算格）；保留 `pointer-events-auto` 才能悬停点亮被偏移到盘面外的标签。 */
        return (
          <span
            key={`label-${region.id}`}
            className="region-label pointer-events-auto absolute select-none whitespace-nowrap"
            style={
              {
                left: centerX * cellSize + offsetX,
                top: (anchor[1] + 1) * cellSize - 2 + offsetY,
                transform: 'translate(-50%, -100%)',
                color: lit ? label.hoverColor : label.color,
                fontFamily: fontFamilyStack(label.fontFamily),
                fontWeight: 700,
                fontSize: scaleFontSize(lit ? label.hoverFontSize : label.fontSize, scale),
                lineHeight: 1.1,
                WebkitTextStroke: `${strokeWidth}px ${
                  lit ? label.hoverStrokeColor : label.strokeColor
                }`,
                paintOrder: 'stroke fill',
                transition:
                  'font-size var(--motion-fast) var(--motion-ease-out), -webkit-text-stroke-color var(--motion-fast) var(--motion-ease-out)',
              } as CSSProperties
            }
            onMouseEnter={() => onHover?.(region.id)}
            onMouseLeave={() => onHover?.(null)}
            /* 只有编辑器（传了 `onSelect`）吃掉按下：`pointerdown` 早于 `click`，只拦 `click` 时格子已被选中；不 `preventDefault`，否则标签点不开。 */
            onPointerDown={
              onSelect
                ? (event) => {
                    event.stopPropagation();
                  }
                : undefined
            }
            /* 拦 `click` 同样跟着 `onSelect`：没传的页面要能冒到容器 `dispatchCell` —— 点标签等于点它底下那格。 */
            onClick={
              onSelect
                ? (event) => {
                    event.stopPropagation();
                    onSelect(region.id);
                  }
                : undefined
            }
            title={region.name}
          >
            {region.name}
          </span>
        );
      })}
    </div>
  );
}

/** 高亮层（OPT-903 / MOD-802）：三组各自 z-index，套一层会成层叠上下文打乱次序；持久，结束时 150ms 淡出。 */
export function MapHighlightLayer({
  highlight,
  regions = [],
  cellSize,
  style,
  leaving = false,
}: {
  highlight: HighlightState | null;
  regions?: DraftRegion[];
  cellSize: number;
  style: MapStyle;
  /** MOD-802: fade the layer out over 150ms instead of unmounting instantly. */
  leaving?: boolean;
}): JSX.Element | null {
  if (!highlight) return null;
  const { cellHighlights, backgroundHighlights, regionBorders } = highlight;
  if (
    cellHighlights.length === 0 &&
    backgroundHighlights.length === 0 &&
    regionBorders.length === 0
  ) {
    return null;
  }
  const opacity = leaving ? 0 : 1;
  const transition = `opacity ${HIGHLIGHT_FADEOUT_MS}ms linear`;

  return (
    <>
      {/* 层 11 · 背景高亮 — only replaces the background layer. */}
      {backgroundHighlights.length > 0 ? (
        <div
          className="pointer-events-none absolute left-0 top-0"
          style={{ zIndex: MAP_LAYER_Z.backgroundHighlight, opacity, transition }}
        >
          {backgroundHighlights.map((rect, index) => (
            <div
              key={`hl-bg-${rect.x}-${rect.y}-${index}`}
              className="absolute"
              style={{
                ...cellRectStyle(rect.x, rect.y, cellSize, rect.w, rect.h),
                backgroundColor: rect.color,
              }}
            />
          ))}
        </div>
      ) : null}

      {/* 层 10 · 方块高亮 — opaque block covering the whole cell. */}
      {cellHighlights.length > 0 ? (
        <div
          className="pointer-events-none absolute left-0 top-0"
          style={{ zIndex: MAP_LAYER_Z.cellHighlight, opacity, transition }}
        >
          {cellHighlights.map((rect, index) => (
            <div
              key={`hl-cell-${rect.x}-${rect.y}-${index}`}
              className="absolute"
              style={{
                ...cellRectStyle(rect.x, rect.y, cellSize, rect.w, rect.h),
                backgroundColor: rect.color,
              }}
            />
          ))}
        </div>
      ) : null}

      {/* 层 9 · 区域高亮线 — inner line hugging the region boundary. */}
      {regionBorders.length > 0 ? (
        <div
          className="pointer-events-none absolute left-0 top-0"
          style={{ zIndex: MAP_LAYER_Z.regionHighlight, opacity, transition }}
        >
          {regionBorders.map((border) => {
            const region = regions.find((item) => item.id === border.regionId);
            if (!region) return null;
            return (
              <RegionHighlightOutline
                key={`hl-rb-${border.regionId}`}
                cells={region.cells}
                cellSize={cellSize}
                regionStyle={resolveRegionStyle(style, region.style)}
              />
            );
          })}
        </div>
      ) : null}
    </>
  );
}
