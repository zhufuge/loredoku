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

/**
 * the overlay layers (cell decoration, cursor boxes, labels, linkage
 * highlight), split out of the old `MapLayers.tsx`.
 */

/**
 * 层 8 · 阻挡遮罩（Blocking Mask）— a `rgba(0,0,0,0.18)` mask for
 * cells whose item-layer item has `blocking === true`.
 *
 * The mask sits **below** 区域轮廓线 and **above** 区域高亮线
 * (see `docs/layer-priority.md` §2). The artwork is above it, but every item
 * image keeps a transparent `itemPadding` ring, so the mask stays visible
 * around it. It is inset to the grid separator so it never paints over it.
 */
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

/**
 * 层 1 · 鼠标光标框（Mouse Cursor Box）— follows the pointer and is always the
 * top-most element on the board. Width, colours and the shadow ring come from
 * `style.mouseCursorBox`.
 */
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

/**
 * 层 2 · 操作光标框（Operation Cursor Box）— pinned to the clicked cell. Drawn
 * as an Outline outside the grid line, so when it shares a cell with the mouse
 * box the mouse line reads as the inner one.
 */
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

/**
 * 层 3 · 区域标签（Region Label）— the region name text, drawn above the
 * artwork with stroke + fill colours and a hover pair.
 *
 * The label is three-level (map default + region override): this layer reads
 * each region's resolved style, like the outline and highlight layers do, which
 * is what makes the per-region `fontFamily` field meaningful.
 */
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
  /**
   * 联动高亮（参与者 → 关联区域）命中的区域 id。
   *
   * 与悬停一样用那一套样式 —— 两者都是「这块区域正被指着」。
   */
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
        /*
         * 圆心的横坐标取「锚点这一行里本区域格子的像素跨度中点」，而不是格心 ——
         * 底部行是偶数格时格心会右偏半格。锚点被挪到别的行 / 盘面之外时退回格心。
         */
        const centerX = labelRowCenterX(region.cells, anchor[1]) ?? anchor[0] + 0.5;
        const hovered = hoveredRegionId === region.id;
        /** 悬停与联动高亮是同一件事 —— 这块区域正被指着，标题就亮。 */
        const lit = hovered || highlightedRegionIds.includes(region.id);
        const resolved = resolveRegionStyle(style, region.style);
        const label = resolved.label;
        /*
         * 每块区域自己那份**位置偏移**，单位是**格的百分比**（100 = 一格）。
         * 作者填的数直接乘格子尺寸就是像素，所以「往右四分之一格」在任何格子
         * 大小下都落在同一个位置。
         *
         * 它跟着纸一起 `transform`（父层带着 zoom / pan），所以缩放时不用另算。
         */
        const offset = resolved.labelOffset;
        const offsetX = (offset.x / 100) * cellSize;
        const offsetY = (offset.y / 100) * cellSize;
        const strokeWidth = styleLineWidth(label.strokeWidth, cellSize);
        /*
         * 标签**不接管点击**：按下沿 React 树冒泡到画布容器的 `onPointerDown`，
         * 由它按 `clientToCell` 换算成格子，再做放置 / 选择 —— 与点盘面上任何
         * 一处像素完全同一条路。
         *
         * 保留 `pointer-events-auto`：悬停要能点亮它自己那块区域（标签可能被
         * `labelCell` / 偏移推到盘面之外，那里没有格子可悬停）。`select-none`
         * 是为了按住拖动时不选中文字。
         */
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
            /*
             * 地图编辑里标签要**吃掉**这次按下，游戏页 / 谜题预览里不能吃。
             *
             * 画布选格发生在容器自己的 `onPointerDown` 里（`EditorCanvas`
             * `handlePointerDown` → `selectCellAt`），而 `pointerdown` 早于
             * `click` —— 只拦 `click` 的话，按下那一刻格子就已经被选中了。
             *
             * 判据是 `onSelect` 在不在：只有地图编辑器会传它（点击弹信息框），
             * 游戏页与谜题预览不传 —— 那里「点标签 = 点底下那格」。
             *
             * 不 `preventDefault()`：后者会抑制兼容的 `click`，标签就点不开了；
             * 按住拖动不选中文字，这一点另有处理。
             */
            onPointerDown={
              onSelect
                ? (event) => {
                    event.stopPropagation();
                  }
                : undefined
            }
            /*
             * `click` 的拦截同样跟着 `onSelect` 走：没传它的页面（谜题编辑器、
             * 游戏页、预览页）抬手那一下要能冒到容器的 `onClick`（`dispatchCell`），
             * 否则点标签等于什么都没发生 —— 标签在这些页面「等于点它底下那一格」。
             */
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

/**
 * Highlight layer (OPT-903, updated by MOD-802 / FEAT-D02).
 *
 * CLAR-603: characters no longer occupy cells, so the layer only draws the
 * cell / background / region overlays; the roster panel handles the
 * `characters` outline directly.
 *
 * The three groups are rendered as separate z-indexed groups instead of one
 * wrapper — a wrapper with a `z-index` would form a stacking context and clip
 * its children's order.
 *
 * MOD-802: highlights are persistent (no auto-expiry). `leaving` applies the
 * 150ms fade-out when an activation ends.
 */
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
