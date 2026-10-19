import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import {
  MAP_LAYER_Z,
  ITEM_HOVER_LIFT_PX,
  ITEM_HOVER_TRANSITION_MS,
  type CellCoord,
  type Asset,
} from '@loredoku/shared';
import type { CellMap } from '@/lib/highlight';
import { cellRectStyle, parseKey } from './layerGeometry';

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
          const item = assetsById.get(cell.background!.assetId);
          if (!item) return null;
          const [x, y] = parseKey(key);
          const src = item.imageThumbUrl ?? item.imageUrl;
          // v0.5.1 FEAT-L01 / SPEC-L03: a colour block fills the cell with its
          // colour — no image needed.
          const block = item.bgColor ? (
            <div
              data-color-block={item.bgColor}
              className="block h-full w-full"
              style={{ backgroundColor: item.bgColor }}
            />
          ) : src ? (
            <img
              src={src}
              alt=""
              draggable={false}
              className="block h-full w-full"
              style={{ objectFit: item.fitMode === 'contain' ? 'contain' : 'cover' }}
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
 * never visually cut by them; the image itself is still clipped inside its
 * cells.
 *
 * OPT-902 §2.3: on hover the image stretches upward by
 * `ITEM_HOVER_LIFT_PX` with a 120ms ease-out transition.
 */
export function MapItemLayer({
  cells,
  assetsById,
  cellSize,
  interactive = false,
  hover = null,
  liftOnHover = true,
  padding = 4,
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
  onPointerDown?: (coord: CellCoord) => void;
  onClick?: (coord: CellCoord, event: ReactMouseEvent<HTMLDivElement>) => void;
}): JSX.Element {
  return (
    <div
      className="no-drag pointer-events-none absolute left-0 top-0"
      style={{ zIndex: MAP_LAYER_Z.itemLayer }}
    >
      {[...cells.entries()]
        .filter(([, cell]) => cell.item)
        .map(([key, cell]) => {
          const anchor = cell.item!;
          const item = assetsById.get(anchor.assetId);
          const [x, y] = parseKey(key);
          const src = item?.imageThumbUrl ?? item?.imageUrl;
          const hovered =
            hover !== null &&
            hover.x >= x &&
            hover.x < x + anchor.w &&
            hover.y >= y &&
            hover.y < y + anchor.h;
          // OPT-902: the lift is a picture affordance; a solid block has no
          // artwork to lift, so it stays put.
          const lifted = hovered && liftOnHover && !item?.bgColor;
          // v0.5.1 FEAT-L01 / SPEC-L03: colour blocks render as a solid block.
          const inner = item?.bgColor ? (
            <div
              data-color-block={item.bgColor}
              className="block h-full w-full"
              style={{ backgroundColor: item.bgColor }}
            />
          ) : src ? (
            <img
              src={src}
              alt=""
              draggable={false}
              className="block h-full w-full"
              style={{
                // OPT-C06: the item's own fitMode is preserved, never forced.
                objectFit: item?.fitMode === 'contain' ? 'contain' : 'cover',
                transform: lifted ? `translateY(-${ITEM_HOVER_LIFT_PX}px)` : undefined,
                transition: `transform ${ITEM_HOVER_TRANSITION_MS}ms ease-out`,
              }}
            />
          ) : null;
          if (!inner) return null;
          return (
            <div
              key={`obj-${key}`}
              className="absolute"
              style={{
                ...cellRectStyle(x, y, cellSize, anchor.w, anchor.h),
                zIndex: MAP_LAYER_Z.itemLayer,
                // The lift is allowed to poke past the cell edge while hovered.
                overflow: lifted ? 'visible' : 'hidden',
                // OPT-C06: the padding applies to the whole footprint, not per cell.
                padding,
                boxSizing: 'border-box',
                pointerEvents: interactive ? 'auto' : 'none',
                cursor: interactive ? 'pointer' : 'inherit',
              }}
              title={item?.name ?? undefined}
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
            </div>
          );
        })}
    </div>
  );
}
