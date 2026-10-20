import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Asset, AssetForm, EditorTool } from '@loredoku/shared';
import { EditorBottomBar } from './EditorBottomBar';

/**
 * 底部工具条的「当前放置资源」芯片：选中资源时显示缩略图 + 名称（多形态
 * 再带形态名），未选中时**整块不渲染**；点击它把左面板找回来。
 */

function form(id: number, assetId: number, overrides: Partial<AssetForm> = {}): AssetForm {
  return {
    id,
    assetId,
    name: '默认',
    widthCells: 1,
    heightCells: 1,
    sortOrder: 0,
    fitMode: 'cover',
    imagePath: null,
    imageUrl: null,
    imageThumbUrl: null,
    imageMime: null,
    imageSize: null,
    imageWidth: null,
    imageHeight: null,
    bgColor: '#CCCCCC',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function asset(id: number, forms: AssetForm[], overrides: Partial<Asset> = {}): Asset {
  return {
    id,
    code: `a_${id}`,
    name: `资源 ${id}`,
    type: 'item',
    blocking: false,
    isActive: true,
    forms,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const chest = asset(1, [
  form(11, 1, { name: '关闭', widthCells: 1, heightCells: 1 }),
  form(12, 1, { name: '打开', widthCells: 2, heightCells: 2 }),
]);
const tree = asset(2, [form(21, 2, { name: '默认', widthCells: 2, heightCells: 2 })]);

interface RenderOverrides {
  activeTool?: EditorTool;
  selectedAsset?: Asset | null;
  selectedForm?: AssetForm | null;
  onRevealItems?: () => void;
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
          selectedForm={overrides.selectedForm ?? null}
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

  it('shows the selected asset, with the form name when it has several forms', () => {
    render({ selectedAsset: chest, selectedForm: chest.forms[1] });
    expect(chip().textContent).toContain('资源 1');
    expect(chip().textContent).toContain('打开');
    expect(chip().getAttribute('title')).toContain('2×2');
  });

  it('keeps a single-form asset to its name and footprint', () => {
    render({ selectedAsset: tree, selectedForm: tree.forms[0] });
    expect(chip().textContent).toContain('资源 2');
    // No redundant 「默认」 label when there is only one form.
    expect(chip().textContent).not.toContain('默认');
    expect(chip().getAttribute('title')).toContain('2×2');
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
    render({ selectedAsset: chest, selectedForm: chest.forms[0], onRevealItems });
    act(() => {
      chip().click();
    });
    expect(onRevealItems).toHaveBeenCalledTimes(1);
  });
});
