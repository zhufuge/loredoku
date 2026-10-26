import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PuzzleEntrySummary } from '@loredoku/shared';
import { PuzzleListRow } from './PuzzleListRow';

/**
 * 谜题列表行的按钮集（v0.7.1 §6.2 / §7.1 第 1 层，v0.7.2 §2）。
 *
 * 这一层是「草稿不能部署」的第一道拦截：草稿行上**连按钮都不渲染**（不是禁用），
 * 版本行才有。其余按钮与地图列表一致 —— 编辑信息 / 复制只给草稿行。
 *
 * v0.7.2：版本行的封面 / 名称点击改成**预览**（不再是「点一下就在库里多一条
 * 草稿」），改版本走预览后面那个「编辑此版本」按钮；「已部署」也从名称里搬出来
 * 独立成一列。
 */
function entry(overrides: Partial<PuzzleEntrySummary> = {}): PuzzleEntrySummary {
  return {
    id: 7,
    kind: 'draft',
    rootId: 7,
    versionNo: null,
    name: '午夜花园',
    description: '六人六格',
    gridSize: 6,
    mapId: 217,
    mapName: '古堡之谜',
    mapVersionNo: 3,
    coverPath: null,
    coverUrl: null,
    currentVersionNo: null,
    versionCount: 0,
    publishedAt: null,
    deployed: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

const versionEntry = (overrides: Partial<PuzzleEntrySummary> = {}): PuzzleEntrySummary =>
  entry({
    id: 9,
    kind: 'version',
    versionNo: 2,
    currentVersionNo: 2,
    versionCount: 2,
    publishedAt: '2026-01-03T00:00:00.000Z',
    ...overrides,
  });

describe('PuzzleListRow (v0.7.1 §6.2)', () => {
  let container: HTMLDivElement;
  let root: Root;
  const handlers = {
    onOpen: vi.fn(),
    onRename: vi.fn(),
    onDuplicate: vi.fn(),
    onDelete: vi.fn(),
    onPreview: vi.fn(),
    onDeploy: vi.fn(),
    onEdit: vi.fn(),
  };

  function render(item: PuzzleEntrySummary): void {
    act(() => {
      root.render(<PuzzleListRow entry={item} {...handlers} />);
    });
  }

  // v0.7.9 §5：图标按钮的「唯一真源」是 aria-label（提示文本由 Tooltip 负责），
  // 所以定位也走 aria-label —— 它同时就是屏幕阅读器读到的那句话。
  const button = (label: string): HTMLButtonElement | undefined =>
    Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (node) => node.getAttribute('aria-label') === label,
    );

  beforeEach(() => {
    for (const handler of Object.values(handlers)) handler.mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('给草稿行渲染 编辑信息 / 预览 / 复制 / 删除，不渲染部署', () => {
    render(entry());
    expect(button('编辑信息')).toBeDefined();
    expect(button('预览草稿')).toBeDefined();
    expect(button('复制')).toBeDefined();
    expect(button('删除')).toBeDefined();
    // 第一道拦截：草稿行永远不可能满足「已发布」，按钮连渲染都不渲染。
    expect(button('部署为游戏')).toBeUndefined();
    expect(container.textContent).not.toContain('部署');
  });

  it('给版本行渲染 预览 / 编辑 / 部署 / 删除，不给编辑信息与复制', () => {
    render(versionEntry());
    expect(button('预览版本')).toBeDefined();
    expect(button('编辑此版本')).toBeDefined();
    expect(button('部署为游戏')).toBeDefined();
    expect(button('删除')).toBeDefined();
    expect(button('编辑信息')).toBeUndefined();
    expect(button('复制')).toBeUndefined();
  });

  it('版本行的封面 / 名称点击走预览，编辑按钮才进编辑态', () => {
    const item = versionEntry();
    render(item);
    const nameButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (node) => node.getAttribute('title') === item.name,
    );
    act(() => nameButton?.click());
    expect(handlers.onPreview).toHaveBeenCalledWith(item);
    expect(handlers.onOpen).not.toHaveBeenCalled();

    act(() => button('编辑此版本')?.click());
    expect(handlers.onEdit).toHaveBeenCalledWith(item);
    // 编辑按钮只是「进编辑器」，不再顺带 fork 或直接打开。
    expect(handlers.onOpen).not.toHaveBeenCalled();
  });

  it('草稿行的封面 / 名称点击仍是进编辑器', () => {
    const item = entry();
    render(item);
    const nameButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (node) => node.getAttribute('title') === item.name,
    );
    act(() => nameButton?.click());
    expect(handlers.onOpen).toHaveBeenCalledWith(item);
    expect(button('编辑此版本')).toBeUndefined();
  });

  it('已部署的版本行把部署按钮说成「重新部署」，且徽标不在名称里', () => {
    const item = versionEntry({ deployed: true });
    render(item);
    expect(button('重新部署为游戏')).toBeDefined();
    expect(container.textContent).toContain('已部署');
    // v0.7.2 §2.2：徽标独立成列 —— 名称按钮自己的文本里没有它。
    const nameButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (node) => node.getAttribute('title') === item.name,
    );
    expect(nameButton?.textContent).not.toContain('已部署');
  });

  it('未部署的版本行不打徽标', () => {
    render(versionEntry());
    expect(container.textContent).not.toContain('已部署');
  });

  it('点部署把整个条目交出去（弹窗要拿它拼默认访问路径）', () => {
    const item = versionEntry();
    render(item);
    act(() => button('部署为游戏')?.click());
    expect(handlers.onDeploy).toHaveBeenCalledWith(item);
  });

  it('草稿与版本都显示底图来源', () => {
    render(entry());
    expect(container.textContent).toContain('古堡之谜 v3');
  });
});
