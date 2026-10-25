import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Asset, DraftRegion } from '@loredoku/shared';
import { EditorCanvas, type EditorCanvasHandle } from './EditorCanvas';
import { resolveMapStyle } from '@/lib/mapStyle';
import type { CellMap } from '@/lib/hitTest';

/**
 * v0.6.3 fix: the bottom bar's ± buttons used to look dead.
 *
 * A zoom step changes the ruler strip, which re-creates `centerView`, which
 * re-runs the adaptive auto-centre effect — and that effect resets the view
 * to 100% unless the interaction marked it as user-adjusted. The wheel path
 * set that flag; the button path did not, so the store took the new zoom for
 * exactly one render before the effect centred it away. A single wheel zoom
 * set the flag and everything (buttons included) worked again afterwards.
 *
 * These tests pin the observable contract: a button zoom reaches the store,
 * and the adaptive pass that re-runs right after must leave it alone.
 */

// React 18 的 act 需要这个开关，否则每次由 effect 触发的更新都会打印一条警告。
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

describe('EditorCanvas — 视图缩放按钮（v0.6.3 fix）', () => {
  let container: HTMLDivElement;
  let root: Root;
  let handle: EditorCanvasHandle | null;
  let onZoom: ReturnType<typeof vi.fn>;
  let onPan: ReturnType<typeof vi.fn>;
  let onAutoCellSize: ReturnType<typeof vi.fn>;

  const cells: CellMap = new Map();
  const regions: DraftRegion[] = [];
  const assetsById: Map<number, Asset> = new Map();

  function render(zoom: number, showRulers = false): void {
    act(() => {
      root.render(
        <EditorCanvas
          ref={(instance) => {
            handle = instance;
          }}
          gridSize={GRID_SIZE}
          cells={cells}
          assetsById={assetsById}
          regions={regions}
          style={resolveMapStyle(undefined)}
          selectedRegionId={null}
          zoom={zoom}
          pan={{ x: 0, y: 0 }}
          selection={null}
          activeTool="select"
          spaceHeld={false}
          showRulers={showRulers}
          pendingVariant={null}
          regionDraftSelection={new Set<string>()}
          highlight={null}
          onAutoCellSize={onAutoCellSize}
          onSelect={vi.fn()}
          onSelectRegion={vi.fn()}
          onDraftAdd={vi.fn()}
          onDraftRemove={vi.fn()}
          onDraftClear={vi.fn()}
          onToggleRegionCell={vi.fn()}
          onPlaceItem={vi.fn()}
          onErase={vi.fn()}
          onZoom={onZoom}
          onPan={onPan}
        />,
      );
    });
  }

  /** The canvas root — EditorCanvas renders exactly one element. */
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
    onZoom = vi.fn();
    onPan = vi.fn();
    onAutoCellSize = vi.fn();
    handle = null;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    render(1);
    // jsdom 的尺寸恒为 0，而自适应居中要真实矩形才会动手——给它一个视口，
    // 这条回归测试要盯的正是「自适应居中再次运行」的那一刻。
    canvasNode().getBoundingClientRect = () => rect(900, 700);
    onZoom.mockClear();
    onPan.mockClear();
    onAutoCellSize.mockClear();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it('the ± button zooms by one step around the viewport centre', () => {
    act(() => handle?.zoomByStep(1));
    expect(onZoom).toHaveBeenCalledWith(1.1);
    // The pan is re-anchored so the centre of the viewport keeps its content.
    expect(onPan).toHaveBeenCalledTimes(1);

    // The step is relative to the zoom the canvas was last rendered with —
    // here still 1, because the test does not feed the store back in.
    act(() => handle?.zoomByStep(-1));
    expect(onZoom).toHaveBeenLastCalledWith(0.9);
  });

  it('a button zoom survives the adaptive pass that re-runs right after it', () => {
    act(() => handle?.zoomByStep(1));
    expect(onZoom).toHaveBeenCalledTimes(1);
    expect(onPan).toHaveBeenCalledTimes(1);

    // The store took the new zoom, so the parent re-renders with it — this is
    // what re-creates `centerView` and re-runs the adaptive effect.
    act(() => render(1.1));

    // The adaptive pass must not centre the zoom away: no reset to 1, no
    // re-centred pan, no recomputed cell size.
    expect(onZoom).toHaveBeenCalledTimes(1);
    expect(onPan).toHaveBeenCalledTimes(1);
    expect(onAutoCellSize).not.toHaveBeenCalled();
  });

  it('适应画布 still resets the view and re-arms the adaptive pass', () => {
    act(() => handle?.zoomByStep(1));
    act(() => render(1.1));
    // The flag is set, so the pass skipped — and centerView clears it.
    act(() => handle?.centerView());
    expect(onZoom).toHaveBeenLastCalledWith(1);

    // Armed again: the next time the pass re-runs (here via a ruler toggle,
    // which re-creates `centerView` just like a zoom step does) it centres.
    onZoom.mockClear();
    act(() => render(1.1, true));
    expect(onZoom).toHaveBeenCalledWith(1);
  });
});
