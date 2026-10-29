import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapResponse, MapEntry } from '@loredoku/shared';
import { mapCanvasApi } from '@/api/mapCanvas';
import { mapsApi } from '@/api/maps';
import { useMapCanvas } from './useMapCanvas';
import { mapKeys, mapCanvasKeys, useUpdateMap } from './useMaps';

/**
 * 改名要顺带把编辑器的缓存也打脏。
 *
 * 编辑器标题读的是 `GET /maps/:id/map` 里的 `map` 快照，而那份查询挂
 * 着 `staleTime: Infinity`：只失效列表（`mapKeys`）时，从列表改完名再进
 * 编辑器，标题仍是旧名，直到整页刷新。
 */
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/api/maps', () => ({
  mapsApi: { update: vi.fn() },
}));
vi.mock('@/api/mapCanvas', () => ({
  mapCanvasApi: { get: vi.fn() },
}));

const oldMapEntry: MapEntry = {
  id: 7,
  name: '旧名',
  description: null,
  themeCode: 'default',
  gridSize: 9,
  coverPath: null,
  coverUrl: null,
  status: 'draft',
  currentVersionNo: null,
  versionNo: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

const newMapEntry: MapEntry = { ...oldMapEntry, name: '新名' };

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
    const { data } = useMapCanvas(7);
    return <span>{data?.map.name ?? '加载中'}</span>;
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
    vi.mocked(mapsApi.update).mockResolvedValue(newMapEntry);
    vi.mocked(mapCanvasApi.get).mockResolvedValue({ map: newMapEntry, draft: null } as MapResponse);
    client.setQueryData<MapResponse>(mapCanvasKeys.detail(7), { map: oldMapEntry, draft: null });
    client.setQueryData(mapKeys.detail(7), oldMapEntry);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    client.clear();
    vi.clearAllMocks();
  });

  it('改名后 /map 缓存与列表缓存一起失效', async () => {
    render(<RenameProbe />);
    expect(client.getQueryState(mapCanvasKeys.detail(7))?.isInvalidated).toBe(false);

    await act(async () => {
      await rename?.();
    });

    expect(client.getQueryState(mapCanvasKeys.detail(7))?.isInvalidated).toBe(true);
    expect(client.getQueryState(mapKeys.detail(7))?.isInvalidated).toBe(true);
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
    expect(mapCanvasApi.get).toHaveBeenCalledWith(7);
  });
});
