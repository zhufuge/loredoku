import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapResponse, Project } from '@loredoku/shared';
import { mapApi } from '@/api/map';
import { mapsApi } from '@/api/maps';
import { useProjectMap } from './useMap';
import { mapEntryKeys, mapKeys, useUpdateMap } from './useMaps';

/**
 * 改名要顺带把编辑器的缓存也打脏。
 *
 * 编辑器标题读的是 `GET /projects/:id/map` 里的 `project` 快照，而那份查询挂
 * 着 `staleTime: Infinity`：只失效列表（`mapEntryKeys`）时，从列表改完名再进
 * 编辑器，标题仍是旧名，直到整页刷新。
 */
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/api/maps', () => ({
  mapsApi: { update: vi.fn() },
}));
vi.mock('@/api/map', () => ({
  mapApi: { get: vi.fn() },
}));

const oldProject: Project = {
  id: 7,
  name: '旧名',
  description: null,
  gridSize: 9,
  coverPath: null,
  coverUrl: null,
  status: 'draft',
  currentVersionNo: null,
  versionNo: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

const newProject: Project = { ...oldProject, name: '新名' };

describe('useUpdateMap', () => {
  let container: HTMLDivElement;
  let root: Root;
  let client: QueryClient;
  let rename: (() => Promise<unknown>) | null = null;

  /** 只挂「改名」，用于观察失效动作本身（没有观察者，失效标记不会被重取冲掉）。 */
  function RenameProbe(): null {
    const { mutateAsync } = useUpdateMap();
    rename = () => mutateAsync({ id: 7, payload: { name: '新名' } });
    return null;
  }

  /** 只挂「编辑器读取」，用于观察重取之后的标题。 */
  function EditorProbe(): JSX.Element {
    const { data } = useProjectMap(7);
    return <span>{data?.project.name ?? '加载中'}</span>;
  }

  function render(node: JSX.Element): void {
    act(() => {
      root.render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
    });
  }

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rename = null;
    vi.mocked(mapsApi.update).mockResolvedValue(newProject);
    vi.mocked(mapApi.get).mockResolvedValue({ project: newProject, draft: null } as MapResponse);
    client.setQueryData<MapResponse>(mapKeys.detail(7), { project: oldProject, draft: null });
    client.setQueryData(mapEntryKeys.detail(7), oldProject);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    client.clear();
    vi.clearAllMocks();
  });

  it('改名后 /map 缓存与列表缓存一起失效', async () => {
    render(<RenameProbe />);
    expect(client.getQueryState(mapKeys.detail(7))?.isInvalidated).toBe(false);

    await act(async () => {
      await rename?.();
    });

    expect(client.getQueryState(mapKeys.detail(7))?.isInvalidated).toBe(true);
    expect(client.getQueryState(mapEntryKeys.detail(7))?.isInvalidated).toBe(true);
  });

  it('改完名再进编辑器会重取，标题跟着新名字走', async () => {
    render(<RenameProbe />);
    await act(async () => {
      await rename?.();
    });

    render(<EditorProbe />);
    // 失效只是把缓存打脏，真正的刷新是异步的 —— 轮询等它落地，别靠单次
    // timer 赌时序。
    await vi.waitFor(() => {
      expect(container.textContent).toBe('新名');
    });
    expect(mapApi.get).toHaveBeenCalledWith(7);
  });
});
