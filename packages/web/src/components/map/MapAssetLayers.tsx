import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  MAP_LAYER_Z,
  ITEM_NAME_TIP_Z,
  ITEM_HOVER_LIFT_PX,
  ITEM_HOVER_TRANSITION_MS,
  ITEM_NAME_TIP_DELAY_MS,
  resolveAssetVariant,
  type CellCoord,
  type Asset,
  type MapStyleItemOutline,
} from '@loredoku/shared';
import { itemOutlineFilter } from '@/lib/mapStyle';
import type { CellMap } from '@/lib/highlight';
import type { CanvasPoint } from '@/lib/grid';
import { TOOLTIP_SURFACE_CLASS } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { cellRectStyle, itemRectStyle, parseKey } from './layerGeometry';

/** 层 12 · 背景图层：资源铺满整格。 */
export function MapBackgroundLayer({
  cells,
  assetsById,
  cellSize,
}: {
  cells: CellMap;
  assetsById: Map<number, Asset>;
  cellSize: number;
}): JSX.Element {
  return (
    <div
      className="no-drag pointer-events-none absolute left-0 top-0"
      style={{ zIndex: MAP_LAYER_Z.backgroundLayer }}
    >
      {[...cells.entries()]
        .filter(([, cell]) => cell.background)
        .map(([key, cell]) => {
          const asset = assetsById.get(cell.background!.assetId);
          // v0.6.1 §6.2: `variantId` first, first variant as the fallback for payloads
          // written before background assets could own several variants, and for
          // variants deleted after publication.
          const look = asset ? resolveAssetVariant(asset, cell.background!.variantId) : undefined;
          if (!look) return null;
          const [x, y] = parseKey(key);
          const src = look.imageThumbUrl ?? look.imageUrl;
          // A colour block fills the cell with its
          // colour — no image needed.
          const block = look.bgColor ? (
            <div
              data-color-block={look.bgColor}
              className="block h-full w-full"
              style={{ backgroundColor: look.bgColor }}
            />
          ) : src ? (
            <img
              src={src}
              alt=""
              draggable={false}
              className="block h-full w-full"
              style={{ objectFit: look.fitMode === 'contain' ? 'contain' : 'cover' }}
            />
          ) : null;
          if (!block) return null;
          return (
            <div
              key={`bg-${key}`}
              className="absolute overflow-hidden"
              style={{ ...cellRectStyle(x, y, cellSize), zIndex: MAP_LAYER_Z.backgroundLayer }}
            >
              {block}
            </div>
          );
        })}
    </div>
  );
}

/** 层 10 · 背景修饰（docs/v0.10.9.md §2）：在背景之上、格线与遮挡遮罩之下；恒 1×1，不带脚位。 */
export function MapDecorationLayer({
  cells,
  assetsById,
  cellSize,
}: {
  cells: CellMap;
  assetsById: Map<number, Asset>;
  cellSize: number;
}): JSX.Element {
  return (
    <div
      className="no-drag pointer-events-none absolute left-0 top-0"
      style={{ zIndex: MAP_LAYER_Z.backgroundDecoration }}
    >
      {[...cells.entries()]
        .filter(([, cell]) => cell.decoration)
        .map(([key, cell]) => {
          const asset = assetsById.get(cell.decoration!.assetId);
          const look = asset ? resolveAssetVariant(asset, cell.decoration!.variantId) : undefined;
          if (!look) return null;
          const [x, y] = parseKey(key);
          const src = look.imageThumbUrl ?? look.imageUrl;
          const block = look.bgColor ? (
            <div
              data-color-block={look.bgColor}
              className="block h-full w-full"
              style={{ backgroundColor: look.bgColor }}
            />
          ) : src ? (
            <img
              src={src}
              alt=""
              draggable={false}
              className="block h-full w-full"
              style={{ objectFit: look.fitMode === 'contain' ? 'contain' : 'cover' }}
            />
          ) : null;
          if (!block) return null;
          return (
            <div
              key={`deco-${key}`}
              className="absolute overflow-hidden"
              style={{ ...cellRectStyle(x, y, cellSize), zIndex: MAP_LAYER_Z.backgroundDecoration }}
            >
              {block}
            </div>
          );
        })}
    </div>
  );
}

/** 层 4 · 物品（格线之上，不被切开）。整层 `pointer-events: none` 不可开：显示框被 scale / 偏移撑出脚位，接管指针会抢走别格的点击，故名称提示不走 Radix。 */
export function MapItemLayer({
  cells,
  assetsById,
  cellSize,
  hover = null,
  pointer = null,
  liftOnHover = true,
  padding = 4,
  gridSize,
  showNameOnHover = true,
  itemOutline = null,
}: {
  cells: CellMap;
  assetsById: Map<number, Asset>;
  cellSize: number;
  /** v0.9.1 §5：物品描边（宽度 0 或 `null` = 不描边）。 */
  itemOutline?: MapStyleItemOutline | null;
  hover?: CellCoord | null;
  /** v0.8.7 §8：光标画布坐标；给了提示贴光标，不给则贴物品上方。 */
  pointer?: CanvasPoint | null;
  /** OPT-902: disable when the caller renders its own hover affordance. */
  liftOnHover?: boolean;
  /** OPT-C06: artwork inset in px; the editor passes the scaled value. */
  padding?: number;
  /** 画布宽几格 —— 名称提示靠边时要靠它翻边，不传就一律居中。 */
  gridSize?: number;
  /** 关掉就只有悬停抬手，不报名字。 */
  showNameOnHover?: boolean;
}): JSX.Element {
  const hoveredKey = useMemo(
    () => (hover === null ? null : hitItemKey(cells, hover)),
    [cells, hover],
  );

  /** 计时器按 key 记、渲染时再对一次 key：划过别的物品必须立刻收掉旧名。 */
  const [tipKey, setTipKey] = useState<string | null>(null);
  useEffect(() => {
    if (!showNameOnHover || hoveredKey === null) {
      setTipKey(null);
      return undefined;
    }
    const timer = window.setTimeout(() => setTipKey(hoveredKey), ITEM_NAME_TIP_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [hoveredKey, showNameOnHover]);
  const tipOn = showNameOnHover && tipKey !== null && tipKey === hoveredKey;

  /** 纸片挂在物品层**之外**的壳子里，否则被困在物品层叠上下文里压不过上层；位置用画布坐标。 */
  const describeTip = (key: string): { name: string; style: CSSProperties } | null => {
    const anchor = cells.get(key)?.item;
    if (!anchor) return null;
    const name = assetsById.get(anchor.assetId)?.name;
    if (!name) return null;
    const [x, y] = parseKey(key);
    return {
      name,
      style: nameTipStyle(itemRectStyle(x, y, cellSize, anchor), cellSize, gridSize, pointer),
    };
  };
  const tip = tipOn && hoveredKey !== null ? describeTip(hoveredKey) : null;

  return (
    <>
      <div
        className="no-drag pointer-events-none absolute left-0 top-0"
        style={{ zIndex: MAP_LAYER_Z.itemLayer }}
      >
        {[...cells.entries()]
          .filter(([, cell]) => cell.item)
          .map(([key, cell]) => {
            const anchor = cell.item!;
            const asset = assetsById.get(anchor.assetId);
            // v0.6.1 §6.2: `variantId` first, first variant as the fallback for v4
            // payloads and for variants deleted after publication.
            const look = asset ? resolveAssetVariant(asset, anchor.variantId) : undefined;
            const [x, y] = parseKey(key);
            const src = look?.imageThumbUrl ?? look?.imageUrl;
            const hovered = hoveredKey === key;
            // OPT-902: the lift is a picture affordance; a solid block has no
            // artwork to lift, so it stays put.
            const lifted = hovered && liftOnHover && !look?.bgColor;
            // 抬手的位移与名字提示都跟着**显示框**走（作者缩放过 /
            // 偏移过的物品，画和名字要一起动），宽高与位置都从 `itemRectStyle` 来。
            const rect = itemRectStyle(x, y, cellSize, anchor);
            /** v0.9.1 §5：宽 0 时 `undefined`，不挂 filter。 */
            const outlineFilter = itemOutline ? itemOutlineFilter(itemOutline, cellSize) : undefined;
            /* Safari（含 iOS）无独立合成层时整条 filter 不画；有描边才加 `will-change: filter`，给全部物品加会白拿合成层。 */
            const outlineLayer: CSSProperties | undefined = outlineFilter
              ? { willChange: 'filter' }
              : undefined;
            // Colour blocks render as a solid block.
            const inner = look?.bgColor ? (
              <div
                data-color-block={look.bgColor}
                className="block h-full w-full"
                style={{ backgroundColor: look.bgColor, filter: outlineFilter, ...outlineLayer }}
              />
            ) : src ? (
              <img
                src={src}
                alt=""
                draggable={false}
                className="block h-full w-full"
                style={{
                  // OPT-C06: the item's own fitMode is preserved, never forced.
                  objectFit: look?.fitMode === 'contain' ? 'contain' : 'cover',
                  transform: lifted ? `translateY(-${ITEM_HOVER_LIFT_PX}px)` : undefined,
                  transition: `transform ${ITEM_HOVER_TRANSITION_MS}ms var(--motion-ease-out)`,
                  // v0.9.1 §5：描边跟着图片的 alpha 走。
                  filter: outlineFilter,
                  ...outlineLayer,
                }}
              />
            ) : null;
            if (!inner) return null;
            return (
              <div
                key={`obj-${key}`}
                className="absolute"
                style={{
                  ...rect,
                  // 提示比一格宽，会盖到旁边那件物品上 —— 被悬停的这件
                  // 临时提到 39（40 是游戏放置层，中间没有别的层）压住同伴。
                  zIndex: hovered ? HOVERED_ITEM_Z : MAP_LAYER_Z.itemLayer,
                  // The lift is allowed to poke past the cell edge while hovered.
                  // v0.9.1 §5：有描边时放开裁剪 —— drop-shadow 会朝四周扩出几像素，
                  // 容器（padding 之内）本来会把超出边框盒的部分切掉。
                  overflow: lifted || outlineFilter ? 'visible' : 'hidden',
                  // OPT-C06: the padding applies to the whole footprint, not per cell.
                  padding,
                  boxSizing: 'border-box',
                  /* 物品层不接管点击：显示框被 scale / 偏移撑出脚位，命中会回传锚点格；点击由画布按 `clientToCell` 分发。 */
                  pointerEvents: 'none',
                }}
              >
                {inner}
              </div>
            );
          })}
      </div>
      {/* 名称纸片的独立层：挂在物品层里会被困在它的层叠上下文，故单开壳子，`zIndex` 取 `ITEM_NAME_TIP_Z`。 */}
      {tip ? (
        <div
          className="no-drag pointer-events-none absolute left-0 top-0"
          style={{ zIndex: ITEM_NAME_TIP_Z }}
        >
          <span
            role="tooltip"
            data-testid="item-name-tip"
            className={cn(
              TOOLTIP_SURFACE_CLASS,
              // `w-max` 让纸片跟着名字长，`max-w-48` 兜住离谱的长名字
              // （一行 12rem，中文 11px 装得下十几个字），`truncate` 收尾。
              'pointer-events-none absolute w-max max-w-48 truncate',
            )}
            style={tip.style}
          >
            {tip.name}
          </span>
        </div>
      ) : null}
    </>
  );
}

/** 提示浮出时被悬停物品压过同伴：38 → 39（40 是游戏放置层）。 */
const HOVERED_ITEM_Z = MAP_LAYER_Z.itemLayer + 1;

/** 提示纸片与物品（或光标）之间的空隙，跟 `TooltipContent` 的 `sideOffset` 一样是 6。 */
const TIP_GAP_PX = 6;
/** 纸片与光标之间留的缝 —— 纸片浮在指针正上方居中。 */
const TIP_CURSOR_GAP_Y = 18;
/** 提示大约 22px 高 + 6px 空隙；头顶不够这么高就翻到下方。 */
const TIP_FLIP_MIN_TOP_PX = 32;
/** 提示半宽的保守估计：比它更靠边就直接贴边对齐，免得被画布切掉一截。 */
const TIP_EDGE_BUDGET_PX = 56;

/** 返回**最后**命中的物品（与渲染叠放一致）；只认脚位 `w × h`，不算 scale 溢出。 */
function hitItemKey(cells: CellMap, hover: CellCoord): string | null {
  let found: string | null = null;
  for (const [key, cell] of cells.entries()) {
    const anchor = cell.item;
    if (!anchor) continue;
    const [x, y] = parseKey(key);
    if (
      hover.x >= x &&
      hover.x < x + anchor.w &&
      hover.y >= y &&
      hover.y < y + anchor.h
    ) {
      found = key;
    }
  }
  return found;
}

/** 画布绝对坐标；有光标贴光标、无光标贴显示框；靠边用预算翻边 —— 提示追着鼠标动，不能等一帧实测宽高。 */
function nameTipStyle(
  rect: CSSProperties,
  cellSize: number,
  gridSize: number | undefined,
  pointer: CanvasPoint | null,
): CSSProperties {
  const gridPx = gridSize === undefined ? null : gridSize * cellSize;

  if (pointer) {
    const above = pointer.y - TIP_CURSOR_GAP_Y - TIP_FLIP_MIN_TOP_PX >= 0;
    return placeTip(
      pointer.x,
      above ? pointer.y - TIP_CURSOR_GAP_Y : pointer.y + TIP_CURSOR_GAP_Y,
      above,
      gridPx,
    );
  }

  const top = Number(rect.top) || 0;
  const bottom = top + (Number(rect.height) || 0);
  const above = top >= TIP_FLIP_MIN_TOP_PX;
  return placeTip(
    (Number(rect.left) || 0) + (Number(rect.width) || 0) / 2,
    above ? top - TIP_GAP_PX : bottom + TIP_GAP_PX,
    above,
    gridPx,
  );
}

/** `above` 时 `y` 是纸片下边、否则上边；横向用 translate 收尾，无需真实宽高。 */
function placeTip(
  anchorX: number,
  y: number,
  above: boolean,
  gridPx: number | null,
): CSSProperties {
  const maxX = gridPx === null ? Number.POSITIVE_INFINITY : Math.max(0, gridPx);
  const nearLeft = anchorX < TIP_EDGE_BUDGET_PX;
  const nearRight = gridPx !== null && anchorX > gridPx - TIP_EDGE_BUDGET_PX;
  // 地图窄到两头都贴边 —— 没得选，居中。
  const shiftX = nearLeft && !nearRight ? 0 : nearRight && !nearLeft ? -100 : -50;

  return {
    left: Math.min(Math.max(anchorX, 0), maxX),
    top: y,
    transform: `translate(${shiftX}%, ${above ? '-100%' : '0'})`,
  };
}
