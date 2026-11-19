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
 * v0.10.9 (docs/v0.10.9.md §2) · 层 10 · 背景修饰层（Background Decoration Layer）
 * — one ornament per cell, sitting **above** the background artwork but below
 * the grid separators and the blocking mask: it decorates the floor, so the
 * cell's grid lines stay crisp on top of it.
 *
 * It shares the cell with `background` and `item`; whatever it paints is 1×1
 * (the requirement says so, and a footprint would fight the item's own).
 */
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
 * v0.7.13 (docs/v0.7.13.md §2): 停一会儿就把资源名报出来。**不走 Radix Tooltip**
 * —— 物品层不接收指针事件（点击一律留给画布容器按格子分发，见 v0.10.2 那段），
 * `TooltipTrigger` 根本收不到 hover；命中本来就已经由画布坐标算好了，直接复用。
 * 于是这里只借 Tooltip 的**长相**（`TOOLTIP_SURFACE_CLASS`），自己算位置。
 *
 * v0.8.7 §8：位置改成**跟着光标**（`pointer`，画布像素）。原来贴在物品上方，物品被
 * 作者缩放过 / 偏移过之后，纸片飘在离指头很远的地方，读起来像另一件东西的名字；
 * 靠边时按画布边界翻边，不靠估算的物品宽度。
 *
 * v0.10.2：这一层整层 `pointer-events: none`，不再有 `interactive` 开关 —— 物品的
 * 显示框被 `scale` / 偏移撑到脚位之外，让它接管指针会让「压在别的格子上的那圈画」
 * 抢走本该落在那一格的点击。
 */
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
  /**
   * v0.8.7 §8：光标的**画布坐标**（像素，原点在画布左上角）。给了就把名称提示贴在
   * 光标旁边；不给（触屏、测试、还没动过鼠标）就退回原来那种「贴在物品上方」。
   */
  pointer?: CanvasPoint | null;
  /** OPT-902: disable when the caller renders its own hover affordance. */
  liftOnHover?: boolean;
  /** OPT-C06: artwork inset in px; the editor passes the scaled value. */
  padding?: number;
  /** v0.7.13: 画布宽几格 —— 名称提示靠边时要靠它翻边，不传就一律居中。 */
  gridSize?: number;
  /** v0.7.13: 关掉就只有悬停抬手，不报名字。 */
  showNameOnHover?: boolean;
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

  /**
   * v0.11.4：纸片的内容与位置。
   *
   * 原先它渲染在**物品自己那个 div 里** —— 那层带 `zIndex`，是个层叠上下文，
   * 于是纸片被钉在物品层（38）里面，永远压在区域标签（42）、工具提示（41）之下，
   * 鼠标光标框（46）更是画在它上面。作者要「出现在地图最上层」，那就只能让它
   * 离开物品层，自己挂一个更高的壳子（见下面的返回值）。
   *
   * 位置随之改成**画布绝对坐标**：壳子在 `left-0 top-0`，纸片用 `left/top` 直接
   * 落在画布坐标里，不必再减物品框的偏移（原来那套是相对物品 padding box 的）。
   */
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
            // v0.7.13: 抬手的位移与名字提示都跟着**显示框**走（作者缩放过 /
            // 偏移过的物品，画和名字要一起动），宽高与位置都从 `itemRectStyle` 来。
            const rect = itemRectStyle(x, y, cellSize, anchor);
            /**
             * v0.9.1 §5：物品描边。宽度 0 时 `undefined`（不挂 filter），所以默认
             * 无描边的物品在 DOM 上和一个 `filter` 都没有时完全一样。
             */
            const outlineFilter = itemOutline ? itemOutlineFilter(itemOutline, cellSize) : undefined;
            /*
             * v0.11.2：有描边时把这层提升成独立的合成层。
             *
             * Safari（含 iOS）在元素没有自己的合成层时，会**整条** filter 不画 —— 表现
             * 就是「Chrome 有描边、Safari 没有」。`will-change: filter` 强制它先落到
             * 一块自己的离屏缓冲里再合成，filter 链因此一定会被光栅化。
             *
             * 只在这一件物品真有描边时才加：没描边的物品不该为了这事白拿一块合成层
             * （盘面上物品数量多，多出来的层会直接换成滚动时的掉帧）。
             */
            const outlineLayer: CSSProperties | undefined = outlineFilter
              ? { willChange: 'filter' }
              : undefined;
            // v0.5.1 FEAT-L01 / SPEC-L03: colour blocks render as a solid block.
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
                  // v0.7.13: 提示比一格宽，会盖到旁边那件物品上 —— 被悬停的这件
                  // 临时提到 39（40 是游戏放置层，中间没有别的层）压住同伴。
                  zIndex: hovered ? HOVERED_ITEM_Z : MAP_LAYER_Z.itemLayer,
                  // The lift is allowed to poke past the cell edge while hovered.
                  // v0.9.1 §5：有描边时放开裁剪 —— drop-shadow 会朝四周扩出几像素，
                  // 容器（padding 之内）本来会把超出边框盒的部分切掉。
                  // v0.11.4：名字纸片搬去独立的最上层，这里不再为它放行。
                  overflow: lifted || outlineFilter ? 'visible' : 'hidden',
                  // OPT-C06: the padding applies to the whole footprint, not per cell.
                  padding,
                  boxSizing: 'border-box',
                  /*
                   * v0.10.2：物品层**不再接管点击**（原本选择类工具下是 `auto`）。
                   *
                   * 显示框是 `itemRectStyle` 给出的 ── 被 `scale`（25%~400%）与
                   * `offsetX/Y` 撑到脚位之外后，它的像素范围远大于脚位。原先那层
                   * `auto` 让「落在溢出画里、却压在别的格子上」的点也命中这件物品，
                   * 并且回传的还是**锚点格**：作者看到树冠画在隔壁格，点它却选中了
                   * 树脚下那一格。现在点击一律冒泡到画布容器，由它按 `clientToCell`
                   * 换算成格子 —— 与盘面上任何一处像素同一条路。
                   *
                   * 脚位内的点击不会因此丢掉「选中物品」：画布的 `hitTestCell` 用
                   * `resolveItemAnchor` 把落在 `w × h` 里的点映射回锚点格，与这里
                   * 原来的效果一致。
                   */
                  pointerEvents: 'none',
                }}
              >
                {inner}
              </div>
            );
          })}
      </div>
      {/*
        v0.11.4：名字纸片的独立层。
        作者要求它「出现在地图最上层」—— 挂在物品层里做不到（那是层叠上下文），
        所以单开一个壳子，`zIndex` 取 `ITEM_NAME_TIP_Z`（鼠标光标框 +1）。
        壳子只做定位，纸片自己在画布坐标里。
      */}
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

/**
 * 提示浮出时，被悬停的那件物品压过同伴。`MAP_LAYER_Z.itemLayer` 是 38，
 * 39 空着，40 是游戏放置层。
 *
 * v0.11.4：名字纸片已经搬出物品层（见 `ITEM_NAME_TIP_Z`），这个常量现在只管
 * 「被悬停的这件压住压在它身上的同伴」这一件事。
 */
const HOVERED_ITEM_Z = MAP_LAYER_Z.itemLayer + 1;

/** 提示纸片与物品（或光标）之间的空隙，跟 `TooltipContent` 的 `sideOffset` 一样是 6。 */
const TIP_GAP_PX = 6;
/** v0.11.4：纸片与光标之间留的缝 —— 原先还让开 14px 横向，改成「正上方居中」后不需要了。 */
const TIP_CURSOR_GAP_Y = 18;
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
 * 名称提示的位置（**画布绝对坐标**）。
 *
 * v0.11.4：纸片从物品框里搬出来，单独挂一层（见 `ITEM_NAME_TIP_Z`），于是坐标
 * 不再相对物品的 padding box，直接落在画布坐标里 —— 少一层「减 left/top」的换算，
 * 也就不必再为 padding box 与 border box 的差去写百分比。
 *
 * - **有光标坐标**（鼠标）：默认浮在指针**正上方**居中，与指针隔 18px；头顶不够
 *   就翻到下方。这是作者要的「标签默认在鼠标上方」。
 * - **没有光标坐标**（触屏、测试）：挂在物品显示框的正上方 6px；同样头顶不够就
 *   翻到下方。
 * - **左右**：默认以锚点居中；离画布左 / 右边不足 56px 时改成从锚点向右 / 向左
 *   展开，保证整片纸留在画布内（画布外面是 `overflow-hidden`，出去就没了）。
 *
 * 翻边用的是**预算**（{@link TIP_EDGE_BUDGET_PX} / {@link TIP_FLIP_MIN_TOP_PX}）
 * 而不是真实尺寸：提示要跟着鼠标动，等一帧量了宽高再放会追不上指针，而少算一点
 * 顶多是贴边多留几像素白，算多了才会被切掉。
 */
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

/**
 * 把纸片摆到锚点的上方（`above`）或下方，横向按画布边界决定展开方向。
 *
 * `anchorX` 是纸片想居中的那条竖线，`y` 是纸片贴着的那个边（上方时是它的下边、
 * 下方时是它的上边）—— 收尾用 `translate`，所以不必知道纸片的真实宽高。
 */
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
