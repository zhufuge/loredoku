import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Asset } from '@loredoku/shared';
import { EditorLeftPanel } from './EditorLeftPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * v0.7.7: 资源与角色面板各有一个刷新按钮 —— 两个列表都是共享查询，别的页面
 * 刚加过东西时不用整页重载（重载会丢撤销栈与视口）。
 *
 * 这里钉住四件事：按钮**紧跟在搜索框右侧**（不在 40px 的 tab 头里）、只跟「资源」
 * tab 共存（区域是本地草稿，没有可刷的）、点击真的调回调、取数中图标转起来
 * 且不能连点。
 */

const ASSETS: Asset[] = [
  {
    id: 3,
    code: 'chest',
    name: '宝箱',
    type: 'item',
    blocking: true,
    isActive: true,
    variants: [
      {
        id: 7,
        assetId: 3,
        name: '关闭',
        fitMode: 'cover',
        imagePath: null,
        imageUrl: null,
        imageThumbUrl: null,
        bgColor: null,
        sortOrder: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

describe('EditorLeftPanel — 刷新按钮（v0.7.7）', () => {
  let container: HTMLDivElement;
  let root: Root;

  function render(overrides: { refreshing?: boolean } = {}): void {
    act(() => {
      root.render(
        <EditorLeftPanel
          assets={ASSETS}
          assetsLoading={false}
          assetsError={false}
          assetsRefreshing={overrides.refreshing ?? false}
          onRefreshAssets={onRefreshAssets}
          activeLayer="item"
          selectedAssetId={null}
          selectedVariantId={null}
          regions={[]}
          selectedRegionId={null}
          onSetLayer={vi.fn()}
          onSelectAsset={vi.fn()}
          onSetTool={vi.fn()}
          onSelectRegion={vi.fn()}
          onDeleteRegion={vi.fn()}
        />,
      );
    });
  }

  const onRefreshAssets = vi.fn();

  const refreshButton = (): HTMLButtonElement | null =>
    container.querySelector<HTMLButtonElement>('[aria-label="刷新资源"]');

  function tabByText(text: string): HTMLButtonElement {
    const found = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => (button.textContent ?? '').trim() === text,
    );
    if (!found) throw new Error(`没有「${text}」按钮`);
    return found;
  }

  beforeEach(() => {
    onRefreshAssets.mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('sits right after the search box, not in the tab header, and calls back on click', () => {
    render();
    const button = refreshButton();
    expect(button).not.toBeNull();
    // 头部那 40px 是 tab 栏（与参与者面板标题栏等高），按钮不在里面。
    expect(button?.closest('div[style]')).toBeNull();
    // 同一行、搜索框右侧：按钮的前一个兄弟节点就是包着搜索框的那一格。
    const search = container.querySelector('input[placeholder="搜索资源"]');
    expect(search).not.toBeNull();
    expect(button?.previousElementSibling?.contains(search!)).toBe(true);
    act(() => button?.click());
    expect(onRefreshAssets).toHaveBeenCalledTimes(1);
  });

  it('disappears on the 区域 tab — draft regions are not fetched', () => {
    render();
    act(() => tabByText('区域').click());
    expect(refreshButton()).toBeNull();
    act(() => tabByText('资源').click());
    expect(refreshButton()).not.toBeNull();
  });

  it('spins and blocks a second click while a fetch is in flight', () => {
    render({ refreshing: true });
    const button = refreshButton();
    expect(button?.disabled).toBe(true);
    expect(button?.getAttribute('aria-busy')).toBe('true');
    expect(button?.querySelector('svg')?.getAttribute('class')).toContain('animate-spin');
  });

  it('does not spin once the fetch settles', () => {
    render();
    const button = refreshButton();
    expect(button?.disabled).toBe(false);
    expect(button?.querySelector('svg')?.getAttribute('class')).not.toContain('animate-spin');
  });
});
