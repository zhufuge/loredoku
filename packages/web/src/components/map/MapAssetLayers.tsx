import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  MAP_LAYER_Z,
  ITEM_HOVER_LIFT_PX,
  ITEM_HOVER_TRANSITION_MS,
  ITEM_NAME_TIP_DELAY_MS,
  resolveAssetVariant,
  type CellCoord,
  type Asset,
} from '@loredoku/shared';
import type { CellMap } from '@/lib/highlight';
import { TOOLTIP_SURFACE_CLASS } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { cellRectStyle, itemRectStyle, parseKey } from './layerGeometry';

/**
 * the item layers, split out of the old `MapLayers.tsx`.
 *
 * 层 12 · 背景图层（Background Layer）— artwork filling the whole cell.
 */
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
          // v0.5.1 FEAT-L01 / SPEC-L03: a colour block fills the cell with its
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

/**
 * 层 4 · 物品图层（Object Layer）— above the grid separators so items are
 * never visually cut by them.
 *
 * OPT-902 §2.3: on hover the image stretches upward by
 * `ITEM_HOVER_LIFT_PX` with a 120ms ease-out transition.
 *
 * v0.7.5 (docs/v0.7.5.md §4): the box is the item's **display** rect, not its
 * footprint — `scale` grows it around the footprint centre and the offsets push
 * it by whole cells, so artwork may legitimately poke outside its cells. The
 * hover test still runs against the footprint: hovering the overhang of a
 * neighbouring cell must not light this item up.
 *
 * v0.7.13 (docs/v0.7.13.md §2): 停够 1s 就把资源名报出来。**不走 Radix Tooltip**
 * —— 物品层在非编辑器页面是 `pointer-events: none`（游戏页要把点击留给格子），
 * `TooltipTrigger` 根本收不到 hover；命中本来就已经由画布坐标算好了，直接复用。
 * 于是这里只借 Tooltip 的**长相**（`TOOLTIP_SURFACE_CLASS`），自己算位置。
 */
export function MapItemLayer({
  cells,
  assetsById,
  cellSize,
  interactive = false,
  hover = null,
  liftOnHover = true,
  padding = 4,
  gridSize,
  showNameOnHover = true,
  onPointerDown,
  onClick,
}: {
  cells: CellMap;
  assetsById: Map<number, Asset>;
  cellSize: number;
  interactive?: boolean;
  hover?: CellCoord | null;
  /** OPT-902: disable when the caller renders its own hover affordance. */
  liftOnHover?: boolean;
  /** OPT-C06: artwork inset in px; the editor passes the scaled value. */
  padding?: number;
  /** v0.7.13: 画布宽几格 —— 名称提示靠边时要靠它翻边，不传就一律居中。 */
  gridSize?: number;
  /** v0.7.13: 关掉就只有悬停抬手，不报名字。 */
  showNameOnHover?: boolean;
  onPointerDown?: (coord: CellCoord) => void;
  onClick?: (coord: CellCoord, event: ReactMouseEvent<HTMLDivElement>) => void;
}): JSX.Element {
  const hoveredKey = useMemo(
    () => (hover === null ? null : hitItemKey(cells, hover)),
    [cells, hover],
  );

  /**
   * 只有**同一个**物品连着停满 1s 才出提示：鼠标从宝箱划到木桶，宝箱的名字
   * 必须立刻收掉，而不是在木桶头上继续挂着一秒。所以计时器按 key 记，渲染时
   * 还要再对一次 key —— 光清 state 会有一帧的错位。
   */
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

  return (
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
          // v0.7.13: 提示挂在**显示框**上（作者缩放过 / 偏移过的物品，名字要跟着
          // 那张画走），宽高与位置都从 `itemRectStyle` 来。
          const rect = itemRectStyle(x, y, cellSize, anchor);
          const tipVisible = tipOn && hovered && Boolean(asset?.name);
          // v0.5.1 FEAT-L01 / SPEC-L03: colour blocks render as a solid block.
          const inner = look?.bgColor ? (
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
              style={{
                // OPT-C06: the item's own fitMode is preserved, never forced.
                objectFit: look?.fitMode === 'contain' ? 'contain' : 'cover',
                transform: lifted ? `translateY(-${ITEM_HOVER_LIFT_PX}px)` : undefined,
                transition: `transform ${ITEM_HOVER_TRANSITION_MS}ms var(--motion-ease-out)`,
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
                // v0.7.13: 提示比一格宽，会盖到旁边那件物品上 —— 被悬停的这件
                // 临时提到 39（40 是游戏放置层，中间没有别的层）压住同伴。
                zIndex: hovered ? HOVERED_ITEM_Z : MAP_LAYER_Z.itemLayer,
                // The lift is allowed to poke past the cell edge while hovered,
                // and so is the name tip.
                overflow: lifted || tipVisible ? 'visible' : 'hidden',
                // OPT-C06: the padding applies to the whole footprint, not per cell.
                padding,
                boxSizing: 'border-box',
                pointerEvents: interactive ? 'auto' : 'none',
                cursor: interactive ? 'pointer' : 'inherit',
              }}
              onPointerDown={(event: ReactPointerEvent<HTMLDivElement>) => {
                if (!interactive) return;
                event.stopPropagation();
                onPointerDown?.({ x, y });
              }}
              onClick={(event) => {
                if (!interactive) return;
                event.stopPropagation();
                onClick?.({ x, y }, event);
              }}
            >
              {inner}
              {tipVisible ? (
                <span
                  role="tooltip"
                  data-testid="item-name-tip"
                  className={cn(
                    TOOLTIP_SURFACE_CLASS,
                    // `w-max` 让纸片跟着名字长，`max-w-48` 兜住离谱的长名字
                    // （一行 12rem，中文 11px 装得下十几个字），`truncate` 收尾。
                    'pointer-events-none absolute w-max max-w-48 truncate',
                  )}
                  style={nameTipStyle(rect, cellSize, gridSize)}
                >
                  {asset!.name}
                </span>
              ) : null}
            </div>
          );
        })}
    </div>
  );
}

/**
 * 提示浮出时，被悬停的那件物品压过同伴。`MAP_LAYER_Z.itemLayer` 是 38，
 * 39 空着，40 是游戏放置层。
 */
const HOVERED_ITEM_Z = MAP_LAYER_Z.itemLayer + 1;

/** 提示纸片与物品之间的空隙，跟 `TooltipContent` 的 `sideOffset` 一样是 6。 */
const TIP_GAP_PX = 6;
/** 提示大约 22px 高 + 6px 空隙；头顶不够这么高就翻到下方。 */
const TIP_FLIP_MIN_TOP_PX = 32;
/** 提示半宽的保守估计：比它更靠边就直接贴边对齐，免得被画布切掉一截。 */
const TIP_EDGE_BUDGET_PX = 56;

/**
 * 命中哪件物品 —— 返回**最后**命中的那个，与渲染顺序里压在最上面的那件一致。
 *
 * 落在脚位上才算（`w` × `h`），落在被 `scale` 撑出去的那圈画里不算，跟悬停
 * 抬手的判定同一条规矩。
 */
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

/**
 * 名称提示的位置（相对物品那个 `div` 的 padding box）。
 *
 * 三件事：
 * - **上下**：默认浮在物品上方 6px；头顶不足 32px（第一行物品，往上就是画布
 *   被 `overflow-hidden` 切掉的边）就翻到下方。画布坐标与提示尺寸一起被 zoom
 *   缩放，所以这里用画布像素判断，任意缩放级别都成立。
 * - **左右**：默认以物品中线居中；离画布左右边不足 56px 时改成贴边对齐，
 *   贴的是**画布**的边（物品自己被 offset 推出去过，就用画布边界兜住）。
 * - 水平用百分比而不是 `width / 2`：绝对定位的包含块是 **padding box**，
 *   而 `rect.width` 是 border box —— 用像素会差出一个 padding（编辑器里
 *   2~12px），正好把纸片推歪。
 * - 不传 `gridSize` 就没有左右边界可依，一律居中。
 */
function nameTipStyle(
  rect: CSSProperties,
  cellSize: number,
  gridSize: number | undefined,
): CSSProperties {
  const left = Number(rect.left) || 0;
  const top = Number(rect.top) || 0;
  const width = Number(rect.width) || 0;
  const gridPx = gridSize === undefined ? null : gridSize * cellSize;

  const vertical: CSSProperties =
    top >= TIP_FLIP_MIN_TOP_PX
      ? { bottom: `calc(100% + ${TIP_GAP_PX}px)` }
      : { top: `calc(100% + ${TIP_GAP_PX}px)` };

  const nearLeft = left < TIP_EDGE_BUDGET_PX;
  const nearRight = gridPx !== null && left + width > gridPx - TIP_EDGE_BUDGET_PX;
  // 地图窄到两头都贴边 —— 没得选，居中。
  if (nearLeft && !nearRight) {
    // 物品自己被 offset 推到画布左边之外时，用画布边界兜住。
    return { ...vertical, left: Math.max(0, -left) };
  }
  if (nearRight && !nearLeft) {
    // 同理：物品右边缘越界多少，纸片就从右边退多少。
    const overflow = gridPx === null ? 0 : Math.max(0, left + width - gridPx);
    return { ...vertical, left: `calc(100% - ${overflow}px)`, transform: 'translateX(-100%)' };
  }
  return { ...vertical, left: '50%', transform: 'translateX(-50%)' };
}
