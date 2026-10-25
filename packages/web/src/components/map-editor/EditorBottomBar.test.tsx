import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Asset, AssetVariant, EditorTool } from '@loredoku/shared';
import { EditorBottomBar } from './EditorBottomBar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * 底部工具条的「当前放置资源」芯片：选中资源时显示缩略图 + 名称（多形态
 * 再带形态名），未选中时**整块不渲染**；点击它把左面板找回来。
 *
 * v0.7.7: 芯片右侧多一个 ×，点它就是取消选中（左面板收起时不用先展开面板）。
 */

function variant(id: number, assetId: number, overrides: Partial<AssetVariant> = {}): AssetVariant {
  return {
    id,
    assetId,
    name: '默认',
    sortOrder: 0,
    fitMode: 'cover',
    imagePath: null,
    imageUrl: null,
    imageThumbUrl: null,
    bgColor: '#CCCCCC',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function asset(id: number, variants: AssetVariant[], overrides: Partial<Asset> = {}): Asset {
  return {
    id,
    code: `a_${id}`,
    name: `资源 ${id}`,
    type: 'item',
    blocking: false,
    isActive: true,
    variants,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const chest = asset(1, [
  variant(11, 1, { name: '关闭' }),
  variant(12, 1, { name: '打开' }),
]);
const tree = asset(2, [variant(21, 2, { name: '默认' })]);

interface RenderOverrides {
  activeTool?: EditorTool;
  selectedAsset?: Asset | null;
  selectedVariant?: AssetVariant | null;
  onRevealItems?: () => void;
  onClearSelection?: () => void;
}

describe('EditorBottomBar — 当前放置资源芯片', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function render(overrides: RenderOverrides = {}): void {
    act(() => {
      root.render(
        <EditorBottomBar
          activeTool={overrides.activeTool ?? 'select'}
          canUndo={false}
          canRedo={false}
          zoom={1}
          gridSize={12}
          itemsOpen
          rulerVisible
          selectedAsset={overrides.selectedAsset ?? null}
          selectedVariant={overrides.selectedVariant ?? null}
          onSetTool={vi.fn()}
          onUndo={vi.fn()}
          onRedo={vi.fn()}
          onZoomIn={vi.fn()}
          onZoomOut={vi.fn()}
          onZoomReset={vi.fn()}
          onFit={vi.fn()}
          onToggleItems={vi.fn()}
          onToggleRuler={vi.fn()}
          onOpenResize={vi.fn()}
          onRevealItems={overrides.onRevealItems ?? vi.fn()}
          onClearSelection={overrides.onClearSelection ?? vi.fn()}
        />,
      );
    });
  }

  /** 芯片是唯一 title 里带「资源面板」的按钮。 */
  function chip(): HTMLButtonElement {
    const found = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      (button.getAttribute('title') ?? '').includes('资源面板'),
    );
    if (!found) throw new Error('current-asset chip not found');
    return found;
  }

  it('shows the selected asset, with the variant name when it has several variants', () => {
    render({ selectedAsset: chest, selectedVariant: chest.variants[1] });
    expect(chip().textContent).toContain('资源 1');
    expect(chip().textContent).toContain('打开');
    // v0.7.6: 芯片不再报占格（形态没有占格了）。
    expect(chip().getAttribute('title')).not.toContain('×');
  });

  it('keeps a single-variant asset to its name', () => {
    render({ selectedAsset: tree, selectedVariant: tree.variants[0] });
    expect(chip().textContent).toContain('资源 2');
    // No redundant 「默认」 label when there is only one variant.
    expect(chip().textContent).not.toContain('默认');
    expect(chip().getAttribute('title')).not.toContain('×');
  });

  it('renders no chip at all when nothing is selected', () => {
    render();
    // 没有缩略图框、也没有「未选择资源」文案：整块不渲染。
    expect(container.textContent).not.toContain('未选择资源');
    expect(
      [...container.querySelectorAll('button')].some((button) =>
        (button.getAttribute('title') ?? '').includes('资源面板'),
      ),
    ).toBe(false);
    // 工具条其余部分照旧（物品开关、标尺、尺寸、缩放都在）。
    expect(container.textContent).toContain('物品');
    expect(container.textContent).toContain('12×12');
    expect(container.textContent).toContain('100%');
  });

  it('reveals the items panel when the chip is clicked', () => {
    const onRevealItems = vi.fn();
    render({ selectedAsset: chest, selectedVariant: chest.variants[0], onRevealItems });
    act(() => {
      chip().click();
    });
    expect(onRevealItems).toHaveBeenCalledTimes(1);
  });

  it('clears the selection from the × beside the chip, without opening the panel', () => {
    const onClearSelection = vi.fn();
    const onRevealItems = vi.fn();
    render({
      selectedAsset: chest,
      selectedVariant: chest.variants[0],
      onClearSelection,
      onRevealItems,
    });
    const clear = container.querySelector<HTMLButtonElement>('[aria-label="取消选中资源"]');
    expect(clear).not.toBeNull();
    act(() => clear?.click());
    expect(onClearSelection).toHaveBeenCalledTimes(1);
    // 两个可点区分开：× 只清选中，不顺手把面板展开。
    expect(onRevealItems).not.toHaveBeenCalled();
  });

  it('shows no × when nothing is selected', () => {
    render();
    expect(container.querySelector('[aria-label="取消选中资源"]')).toBeNull();
  });
});
