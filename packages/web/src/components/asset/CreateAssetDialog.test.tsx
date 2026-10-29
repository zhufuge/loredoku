import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateAssetDialog } from './CreateAssetDialog';

/**
 * v0.8.2 §14：新建弹窗里的「主题」一行，只在**真的能选**时出现。
 *
 * 工作空间里主题由地址定（`/hlm/assets`），这一行曾经是只读的一行事实
 * （`主题　红楼梦 · 当前工作空间`）—— 地址说了、顶栏说了，弹窗里再说第三遍，
 * 却不让人做任何决定。
 *
 * 所以这里测的是**两条分支都存在**：有工作空间时整行不画；没有工作空间上下文
 * （旧地址、整屏入口）时仍然要问，因为那时没有别的地方能回答「建到哪个世界」。
 * 只测「不出现」是不够的 —— 把整个组件删掉也能让那条断言通过。
 */

let workspaceValue: { themeCode: string } | null = { themeCode: 'hlm' };

vi.mock('@/components/layout/WorkspaceContext', () => ({
  useWorkspace: () => workspaceValue,
}));

vi.mock('@/hooks/useThemes', () => ({
  useThemes: () => ({
    data: [
      { code: 'default', name: '默认主题' },
      { code: 'hlm', name: '红楼梦' },
    ],
    isLoading: false,
  }),
}));

vi.mock('@/hooks/useAssets', () => ({
  useCreateAsset: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateAsset: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUploadAssetVariantImage: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

describe('CreateAssetDialog 的主题作用域行', () => {
  let container: HTMLDivElement;
  let root: Root;

  function render(): void {
    act(() => {
      root.render(<CreateAssetDialog open onOpenChange={() => {}} onCreated={() => {}} />);
    });
  }

  beforeEach(() => {
    workspaceValue = { themeCode: 'hlm' };
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const text = (): string => document.body.textContent ?? '';
  const themeSelect = (): HTMLSelectElement | null =>
    document.querySelector<HTMLSelectElement>('select[aria-label="主题"]');

  it('工作空间里：不出现主题那一行', () => {
    render();

    expect(themeSelect()).toBeNull();
    expect(text()).not.toContain('当前工作空间');
    // 主题列表是拿得到的（两间），所以「没出现」不是因为没数据。
    expect(text()).not.toContain('红楼梦');
  });

  it('工作空间里：业务 ID 仍然按地址的主题预填前缀', () => {
    render();

    const code = document.querySelector<HTMLInputElement>('#asset-code');
    expect(code?.value).toBe('hlm_');
    expect(text()).toContain('前缀 hlm_ 已填好');
  });

  it('没有工作空间上下文：仍然让你选主题，并同步成列表第一个', () => {
    workspaceValue = null;
    render();

    const select = themeSelect();
    expect(select).not.toBeNull();
    expect(select?.value).toBe('default');
    // 可换的地方才需要那句「创建后不可更改」。
    expect(text()).toContain('创建后不可更改');
  });
});
