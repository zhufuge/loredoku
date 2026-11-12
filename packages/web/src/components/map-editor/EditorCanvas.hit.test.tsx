import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Asset, DraftRegion } from '@loredoku/shared';
import { EditorCanvas } from './EditorCanvas';
import { resolveMapStyle } from '@/lib/mapStyle';
import type { CellMap } from '@/lib/hitTest';

/**
 * v0.10.2：点「区域标题」与「物品溢出位置」，也要按地图方格分割线落点。
 *
 * 这两处原来各自接管指针（区域标签是一枚 `stopPropagation()` 的按钮、物品层在
 * 选择类工具下 `pointer-events: auto`），于是：
 *
 * - 点标签覆盖的那块像素选中的是**区域**，而标签悬在格子上沿、盖住的往往不是
 *   自己区域的格子；
 * - 点物品被 `scale` 撑出去、压在隔壁格上的那圈画，命中的是**物品**，回传的
 *   还是它脚位的锚点格。
 *
 * 现在两处都让位给画布容器：按下沿 React 树冒泡到容器的 `onPointerDown`，由它
 * 按 `clientToCell` 换算成格子。这里钉的正是这条行为 —— 事件从标签 / 物品元素
 * 上发出，落在哪个像素就选中哪一格。
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const GRID_SIZE = 6;

function rect(width: number, height: number): DOMRect {
  return {
    left: 0,
    top: 0,
    width,
    height,
    right: width,
    bottom: height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

function asset(id: number): Asset {
  return {
    id,
    code: `item_${id}`,
    name: `Asset ${id}`,
    type: 'item',
    blocking: true,
    isActive: true,
    variants: [
      {
        id: id * 10,
        assetId: id,
        name: '形态',
        sortOrder: 0,
        fitMode: 'cover',
        imagePath: 'assets/p.png',
        imageUrl: '/uploads/p.png',
        imageThumbUrl: '/uploads/p.png',
        bgColor: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const picture = asset(2);
const assetsById = new Map<number, Asset>([[picture.id, picture]]);

/** 按下 `pointerdown`（jsdom 没有命中测试，直接在元素上发出即可 —— 这条路径要验的正是「冒泡到容器之后怎么换算」）。 */
function pointerDownAt(target: Element, clientX: number, clientY: number): void {
  act(() => {
    target.dispatchEvent(
      new MouseEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX,
        clientY,
      }),
    );
  });
}

describe('EditorCanvas — 点标签 / 物品溢出位置按方格落点（v0.10.2）', () => {
  let container: HTMLDivElement;
  let root: Root;
  let onSelect: ReturnType<typeof vi.fn>;
  let onSelectRegion: ReturnType<typeof vi.fn>;
  /** 自适应算出来的格子边长（`resolveMapStyle(undefined)` 不覆盖它，所以这就是渲染用的值）。 */
  let cellSize: number;
  let originalRect: () => DOMRect;

  const cells: CellMap = new Map();
  let regions: DraftRegion[] = [];

  function render(): void {
    act(() => {
      root.render(
        <EditorCanvas
          gridSize={GRID_SIZE}
          cells={cells}
          assetsById={assetsById}
          regions={regions}
          style={resolveMapStyle(undefined)}
          selectedRegionId={null}
          zoom={1}
          pan={{ x: 0, y: 0 }}
          selection={null}
          activeTool="select"
          spaceHeld={false}
          showRulers={false}
          pendingVariant={null}
          regionDraftSelection={new Set<string>()}
          highlight={null}
          onAutoCellSize={(next) => {
            cellSize = next;
          }}
          onSelect={onSelect}
          onSelectRegion={onSelectRegion}
          onDraftAdd={vi.fn()}
          onDraftRemove={vi.fn()}
          onDraftClear={vi.fn()}
          onToggleRegionCell={vi.fn()}
          onPlaceItem={vi.fn()}
          onErase={vi.fn()}
          onZoom={vi.fn()}
          onPan={vi.fn()}
        />,
      );
    });
  }

  const canvasNode = (): HTMLElement => container.firstElementChild as HTMLElement;

  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      },
    );
    /*
     * jsdom 没有排版，所有尺寸都是 0，而自适应居中要看到真实矩形才会算出
     * `cellSize` —— 没有它连 `clientToCell` 都无从换算。挂到原型上，让**挂载
     * 那一刻**（自适应 effect 首次运行）就已经看得到这个视口。
     */
    originalRect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = () => rect(900, 700);
    onSelect = vi.fn();
    onSelectRegion = vi.fn();
    cellSize = 0;
    regions = [];
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    render();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    HTMLElement.prototype.getBoundingClientRect = originalRect;
    vi.unstubAllGlobals();
  });

  it('点区域标题覆盖的那块像素：选中它底下那一格，不是区域', () => {
    /*
     * 区域的格子在第 3 行，标签却配在第 1 行（`labelCell`）—— 这正是真实的
     * 「标签悬在格子上沿、盖住的是上一格」：标签底边落在 `2 × cellSize` 上方
     * 一点点，指头压上去的那块像素属于第 1 行。
     */
    regions = [{ id: 'rg_a', name: '回廊', cells: [[1, 3]], labelCell: [1, 1] }];
    render();
    expect(cellSize).toBeGreaterThan(0);

    const label = container.querySelector('.region-label');
    expect(label).not.toBeNull();

    // 标签底边上方 1px：仍在标签盒子内，且属于第 1 行。
    pointerDownAt(label!, 1.5 * cellSize, 2 * cellSize - 3);

    expect(onSelect).toHaveBeenCalledWith({ type: 'cell', x: 1, y: 1 });
    expect(onSelectRegion).toHaveBeenCalledWith(null);
  });

  it('点物品被放大后压在隔壁格上的那圈画：选中那一格，不是物品的锚点', () => {
    // 1×1 的物品放在 (0,0)，放大到 3 倍 —— 显示框一路长到 (2,2) 附近。
    cells.set('0,0', { item: { assetId: picture.id, w: 1, h: 1, scale: 3 } });
    render();

    const box = container.querySelector<HTMLDivElement>('img')?.parentElement;
    expect(box).not.toBeNull();

    // 点在 (1,1) 的格心：落在溢出画里，但那一格没有物品。
    pointerDownAt(box!, 1.5 * cellSize, 1.5 * cellSize);

    expect(onSelect).toHaveBeenCalledWith({ type: 'cell', x: 1, y: 1 });
    expect(onSelectRegion).toHaveBeenCalledWith(null);
  });

  it('点物品自己的脚位：仍然选中它（画布按脚位把点映射回锚点）', () => {
    cells.set('0,0', { item: { assetId: picture.id, w: 1, h: 1, scale: 3 } });
    render();

    const box = container.querySelector<HTMLDivElement>('img')?.parentElement;

    // (0,0) 的格心在 0.5 × cellSize —— 脚位之内，物品照旧选得中。
    pointerDownAt(box!, 0.5 * cellSize, 0.5 * cellSize);

    expect(onSelect).toHaveBeenCalledWith({ type: 'cell', x: 0, y: 0 });
  });
});
