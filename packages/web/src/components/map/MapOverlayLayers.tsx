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
 * v0.3.8 SPEC-D01: the mask sits **below** 区域轮廓线 and **above** 区域高亮线
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

/**
 * 层 3 · 区域标签（Region Label）— the region name text, drawn above the
 * artwork with stroke + fill colours and a hover pair.
 *
 * v0.7.0 made the label three-level (map default + region override), but this
 * layer kept reading the **map-level** block for every region — a region that
 * set its own label size / colour / typeface showed nothing of it. v0.7.4 reads
 * the region's resolved style like the outline and highlight layers already do,
 * which is also what makes the new `fontFamily` field meaningful per region.
 */
export function MapRegionLabelLayer({
  regions,
  cellSize,
  style,
  hoveredRegionId = null,
  onHover,
  onSelect,
}: {
  regions: DraftRegion[];
  cellSize: number;
  style: MapStyle;
  hoveredRegionId?: string | null;
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
         * v0.10.7：圆心的横坐标取「锚点这一行里本区域格子的像素跨度中点」，
         * 不再是「锚点格的格心」。底部行是偶数格时后者右偏半格（17155 的
         * 「穿廊」压在 [3,4]+[4,4] 上就是典型）。锚点被挪到别的行 / 盘面之外
         * 时退回格心。
         */
        const centerX = labelRowCenterX(region.cells, anchor[1]) ?? anchor[0] + 0.5;
        const hovered = hoveredRegionId === region.id;
        const resolved = resolveRegionStyle(style, region.style);
        const label = resolved.label;
        /*
         * v0.9.6：每块区域自己那份**位置偏移**。
         *
         * v0.10.7 修：原来它是不缩放的裸像素 —— 于是「左 = 锚点格心 + offset」
         * 里两项不同口径，`cellSize` 一变（开 / 关标尺、换窗口大小、换一张
         * 格子更大的图）偏移量在格子上的占比就跟着变，标签肉眼可见地挪位置。
         * 实测 17155「穿廊」偏移 200：标尺开时占 1.70 格，关掉变成 1.87 格。
         *
         * 现在按 `cellScale(cellSize)` 缩放，与这一层其它几何（描边宽度、字号）
         * 同一口径 —— 作者填的数字以 `BASE_CELL`（120px 格子）为基准，换算后
         * 偏移量恒定占相同比例的格子，开关标尺不再动。
         *
         * 它跟着纸一起 `transform`（父层带着 zoom / pan），所以缩放时不用另算。
         */
        const offset = resolved.labelOffset;
        const offsetX = offset.x * scale;
        const offsetY = offset.y * scale;
        const strokeWidth = styleLineWidth(label.strokeWidth, cellSize);
        /*
         * v0.10.2：标签**不再接管点击**。
         *
         * 它原来是一枚 `stopPropagation()` 的 `<button>`，于是「区域标题占的那块
         * 像素」点下去选中的是区域，而不是标题底下那一格 —— 而标签用
         * `translate(-50%, -100%)` 悬在格子上沿，盖住的往往根本不是自己区域的格子。
         * 现在把点击放回画布容器：按下沿 React 树冒泡到容器的 `onPointerDown`，
         * 由它按 `clientToCell` 换算成格子，再做放置 / 选择 —— 与点盘面上任何
         * 一处像素完全同一条路。
         *
         * 仍留 `pointer-events-auto`：悬停要能点亮它自己那块区域（标签可能被
         * `labelCell` / 偏移推到盘面之外，那里没有格子可悬停）。`select-none` 是因为
         * 它已经不是按钮了，按住拖动不该选中文字。
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
                color: hovered ? label.hoverColor : label.color,
                fontFamily: fontFamilyStack(label.fontFamily),
                fontWeight: 700,
                fontSize: scaleFontSize(hovered ? label.hoverFontSize : label.fontSize, scale),
                lineHeight: 1.1,
                WebkitTextStroke: `${strokeWidth}px ${
                  hovered ? label.hoverStrokeColor : label.strokeColor
                }`,
                paintOrder: 'stroke fill',
                transition:
                  'font-size var(--motion-fast) var(--motion-ease-out), -webkit-text-stroke-color var(--motion-fast) var(--motion-ease-out)',
              } as CSSProperties
            }
            onMouseEnter={() => onHover?.(region.id)}
            onMouseLeave={() => onHover?.(null)}
            /*
             * v0.10.7：地图编辑里标签要**吃掉**这次按下，游戏页 / 谜题预览里
             * 不能吃。
             *
             * 画布选格发生在容器自己的 `onPointerDown` 里（`EditorCanvas`
             * `handlePointerDown` → `selectCellAt`），而 `pointerdown` 早于
             * `click`。只 `stopPropagation()` 一个 `click` 的话，按下那一刻格子
             * 已经被选中了，信息框虽然弹出，选区却跑到了标题底下那一格。
             *
             * 判据是 `onSelect` 在不在：只有地图编辑器会传它（点击弹信息框），
             * 游戏页与谜题预览不传 —— 那里仍保持 v0.10.2 的「点标签 = 点底下那格」。
             *
             * 不 `preventDefault()`：后者会抑制兼容的 `click`，标签就点不开了
             * （文字选中已由 `select-none` 挡住）。
             */
            onPointerDown={
              onSelect
                ? (event) => {
                    event.stopPropagation();
                  }
                : undefined
            }
            onClick={(event) => {
              event.stopPropagation();
              onSelect?.(region.id);
            }}
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
