import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapEntrySummary } from '@loredoku/shared';
import { MapsPage } from './MapsPage';

/**
 * v0.7.9 §1.1（修正）：视图开关**只服务草稿块**，版本块恒为列表。
 *
 * 曾经让版本块也跟着变网格，理由是「工具条声明的是页面级偏好」，但版本是冻结
 * 快照：`v{n}` 徽标 + 「以此为底稿新建」在列表里一行读完，做成大卡片反而像
 * 一件可选的作品，主按钮落在最显眼处也更容易误触。
 *
 * 于是开关从工具条下沉到「草稿」标题右侧 —— 作用域由位置说明。这个文件同时
 * 钉住三件事：草稿跟着开关、版本不跟、没有草稿时开关不出现。
 */

const state = vi.hoisted(() => ({
  drafts: [] as MapEntrySummary[],
  versions: [] as MapEntrySummary[],
}));

vi.mock('@/hooks/useMaps', () => {
  const list = (params: { kind?: string }) => {
    const items = params.kind === 'version' ? state.versions : state.drafts;
    return {
      data: { list: items, total: items.length, page: 1, pageSize: 12 },
      isLoading: false,
      isError: false,
      error: null,
      refetch: () => undefined,
    };
  };
  const mutation = () => ({ mutate: () => undefined, isPending: false });
  return {
    useMaps: list,
    useCreateMap: mutation,
    useUpdateMap: mutation,
    useDuplicateMap: mutation,
    useDeleteMap: mutation,
    useUploadMapCover: mutation,
    useRemoveMapCover: mutation,
  };
});

vi.mock('@/hooks/useVersions', () => ({
  useDeleteVersion: () => ({ mutate: () => undefined, isPending: false }),
}));

function entry(kind: 'draft' | 'version', id: number, name: string): MapEntrySummary {
  return {
    id,
    kind,
    rootId: 1,
    mapId: id,
    versionNo: kind === 'version' ? 2 : null,
    name,
    description: null,
    gridSize: 6,
    coverPath: null,
    coverUrl: null,
    status: kind === 'version' ? 'published' : 'draft',
    currentVersionNo: kind === 'version' ? 2 : null,
    versionCount: 1,
    publishedAt: kind === 'version' ? '2026-01-04T08:00:00.000Z' : null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-04T08:00:00.000Z',
  };
}

describe('MapsPage — 版本块恒为列表（v0.7.9 §1.1 修正）', () => {
  let container: HTMLDivElement;
  let root: Root;

  const render = (): void => {
    act(() => {
      root.render(
        <MemoryRouter>
          <MapsPage />
        </MemoryRouter>,
      );
    });
  };

  /**
   * 「卡片」的判据是封面区（`MapGridCard` 里那个 `aspect-[4/3]` 的按钮）——
   * `MapListRow` 没有这块结构，比数 `h3` 更贴近「用户看到的形态」。
   */
  const cardCovers = (): number => container.querySelectorAll('[class*="aspect-"]').length;

  const findButton = (title: string): HTMLButtonElement | undefined =>
    Array.from(container.querySelectorAll('button')).find(
      (node) => node.getAttribute('title') === title,
    );

  const clickView = (title: string): void => {
    act(() => findButton(title)?.click());
  };

  beforeEach(() => {
    state.drafts = [entry('draft', 1, '午夜花园')];
    state.versions = [entry('version', 2, '午夜花园')];
    window.localStorage.removeItem('loredoku.maps.view');
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    window.localStorage.clear();
  });

  it('网格视图下只有草稿出卡片，版本仍是行', () => {
    render();
    expect(container.textContent).toContain('草稿');
    expect(container.textContent).toContain('版本');
    // 1 = 草稿那张卡；版本块若也变卡片，这里会是 2。
    expect(cardCovers()).toBe(1);
  });

  it('列表视图下两块都是行', () => {
    render();
    clickView('列表视图');
    expect(cardCovers()).toBe(0);
  });

  it('从网格切回列表，草稿块跟着变、版本块没变过', () => {
    render();
    clickView('列表视图');
    expect(cardCovers()).toBe(0);
    clickView('网格视图');
    expect(cardCovers()).toBe(1);
  });

  it('没有草稿时不渲染视图开关 —— 它只管草稿块，没草稿就没有作用对象', () => {
    state.drafts = [];
    render();
    expect(container.textContent).toContain('版本');
    expect(findButton('网格视图')).toBeUndefined();
    expect(findButton('列表视图')).toBeUndefined();
  });

  it('视图偏好仍然持久化（刷新后保持）', () => {
    render();
    clickView('列表视图');
    expect(window.localStorage.getItem('loredoku.maps.view')).toBe('list');
  });
});
