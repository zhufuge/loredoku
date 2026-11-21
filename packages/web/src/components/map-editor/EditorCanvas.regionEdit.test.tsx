import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DraftRegion } from '@loredoku/shared';
import { EditorCanvas } from './EditorCanvas';
import { resolveMapStyle } from '@/lib/mapStyle';
import type { CellMap } from '@/lib/hitTest';
import { seedRegionCellEdit, type RegionCellEdit } from '@/lib/regionEdit';

/**
 * 区域格子的编辑会话里，画布上的点按 / 拖动只做一件事 —— 把这一笔的
 * 格子报给页面（`onRegionEditStroke`），由页面改草稿。
 *
 * 三条要钉住的行为：
 * 1. 起点格**不在**草稿里 → 这一笔是「加入」；起点格在草稿里 → 整笔「移除」
 *    （与区域笔刷同一条 `brushStrokeErases` 规则，一笔之内方向不变）；
 * 2. 按住 `Alt` 永远移除，不管起点格在不在草稿里；
 * 3. 会话期间点格子**不再选格** —— 否则每点一下就顺手改掉了右边抽屉的对象。
 */

// 标尺符号走 `useRulerSymbolsByCode`（内部是 TanStack Query），这里没有 Provider。
vi.mock('@/hooks/useThemes', () => ({
  useRulerSymbolsByCode: () => () => ({ columnSymbol: 'C', rowSymbol: 'R' }),
}));

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

/** 一块 2×2 的区域：编辑时既能加格，也能减格。 */
const REGION: DraftRegion = {
  id: 'rg_a',
  name: '森林区',
  cells: [
    [0, 0],
    [1, 0],
  ],
};

describe('EditorCanvas — 区域格子编辑的笔画（v0.11.5）', () => {
  let container: HTMLDivElement;
  let root: Root;
  let cellSize: number;
  let originalRect: () => DOMRect;
  let onRegionEditStroke: ReturnType<typeof vi.fn>;
  let onSelect: ReturnType<typeof vi.fn>;
  let edit: RegionCellEdit;

  const cells: CellMap = new Map();

  function render(nextEdit: RegionCellEdit | null = edit): void {
    act(() => {
      root.render(
        <EditorCanvas
          gridSize={GRID_SIZE}
          cells={cells}
          assetsById={new Map()}
          regions={[REGION]}
          style={resolveMapStyle(undefined)}
          selectedRegionId={REGION.id}
          zoom={1}
          pan={{ x: 0, y: 0 }}
          selection={null}
          activeTool="select"
          spaceHeld={false}
          showRulers={false}
          themeCode="test"
          pendingVariant={null}
          regionDraftSelection={new Set<string>()}
          highlight={null}
          regionEdit={nextEdit}
          onRegionEditStroke={onRegionEditStroke}
          onAutoCellSize={(next) => {
            cellSize = next;
          }}
          onSelect={onSelect}
          onSelectRegion={vi.fn()}
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

  const canvas = (): HTMLElement => container.firstElementChild as HTMLElement;
  /** 第 (x, y) 格的中心点。 */
  const centerOf = (x: number, y: number): { clientX: number; clientY: number } => ({
    clientX: (x + 0.5) * cellSize,
    clientY: (y + 0.5) * cellSize,
  });

  function down(x: number, y: number, altKey = false): void {
    const point = centerOf(x, y);
    act(() => {
      canvas().dispatchEvent(
        new MouseEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          button: 0,
          altKey,
          ...point,
        }),
      );
    });
  }

  function move(x: number, y: number): void {
    const point = centerOf(x, y);
    act(() => {
      canvas().dispatchEvent(
        new MouseEvent('pointermove', { bubbles: true, cancelable: true, ...point }),
      );
    });
  }

  function up(): void {
    act(() => {
      canvas().dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true }));
    });
  }

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
     * jsdom 不实现指针捕获 —— 笔画一开始就会 `setPointerCapture`，没有它整条
     * 路径直接抛错。这里补两个空实现，捕获本身在测试里没有观察价值。
     */
    Object.assign(HTMLElement.prototype, {
      setPointerCapture: () => undefined,
      releasePointerCapture: () => undefined,
    });
    originalRect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = () => rect(900, 700);
    onRegionEditStroke = vi.fn();
    onSelect = vi.fn();
    cellSize = 0;
    edit = seedRegionCellEdit(REGION);
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

  it('点在草稿外的空格：这一笔是「加入」，只报这一格', () => {
    expect(cellSize).toBeGreaterThan(0);
    down(2, 2);
    up();
    expect(onRegionEditStroke).toHaveBeenCalledTimes(1);
    expect(onRegionEditStroke).toHaveBeenCalledWith(['2,2'], false);
  });

  it('点在草稿里的格子：整笔「移除」（一笔之内方向不变）', () => {
    down(0, 0);
    up();
    expect(onRegionEditStroke).toHaveBeenCalledWith(['0,0'], true);
  });

  it('按住 Alt：空格也是移除', () => {
    down(3, 3, true);
    up();
    expect(onRegionEditStroke).toHaveBeenCalledWith(['3,3'], true);
  });

  it('拖动经过的格子都进这一笔，方向沿用按下那一刻', () => {
    down(2, 2);
    move(3, 2);
    move(4, 2);
    up();
    expect(onRegionEditStroke).toHaveBeenCalledTimes(1);
    const [keys, erase] = onRegionEditStroke.mock.calls[0] as [string[], boolean];
    expect(new Set(keys)).toEqual(new Set(['2,2', '3,2', '4,2']));
    expect(erase).toBe(false);
  });

  it('编辑期间点格子不选格（右边抽屉的对象不该跟着跳）', () => {
    down(2, 2);
    up();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('预览：草稿多出来的格子标 add、少掉的标 remove', () => {
    // 草稿 = 原有两格去掉 (1,0)、再加上 (2,2)。
    const next: RegionCellEdit = {
      regionId: REGION.id,
      cells: new Set(['0,0', '2,2']),
    };
    render(next);
    const adds = container.querySelectorAll('[data-region-edit="add"]');
    const removes = container.querySelectorAll('[data-region-edit="remove"]');
    expect(adds).toHaveLength(1);
    expect(removes).toHaveLength(1);
  });

  it('没有会话时不画预览层，点格子也照旧选格', () => {
    render(null);
    expect(container.querySelector('[data-testid="region-edit-preview"]')).toBeNull();
    down(2, 2);
    up();
    expect(onRegionEditStroke).not.toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledWith({ type: 'cell', x: 2, y: 2 });
  });
});
