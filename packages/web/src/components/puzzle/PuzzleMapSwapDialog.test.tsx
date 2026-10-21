import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublishedMapVersion } from '@loredoku/shared';
import { PuzzleMapSwapDialog } from './PuzzleMapSwapDialog';

/**
 * v0.7.3 §3.2：「引入新地图」只列**同尺寸**的已发布版本，并排除当前这一份 ——
 * 尺寸不同等于换坐标系，当前这份点它没有意义。
 *
 * Radix 把面板 portal 到 `document.body`，所以查询走 `document`。
 */
const state = vi.hoisted(() => ({
  versions: [] as PublishedMapVersion[],
  isLoading: false,
  navigate: vi.fn(),
}));

vi.mock('@/hooks/useMaps', () => ({
  usePublishedVersions: () => ({ data: state.versions, isLoading: state.isLoading }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => state.navigate,
}));

function version(overrides: Partial<PublishedMapVersion> = {}): PublishedMapVersion {
  return {
    mapId: 217,
    rootId: 217,
    versionNo: 3,
    mapName: '午夜花园',
    gridSize: 6,
    publishedAt: '2026-01-03T00:00:00.000Z',
    ...overrides,
  };
}

const current = { mapId: 217, versionNo: 3, mapName: '午夜花园', gridSize: 6 };

describe('PuzzleMapSwapDialog (v0.7.3 §3.2)', () => {
  let container: HTMLDivElement;
  let root: Root;
  const onConfirm = vi.fn();
  const onOpenChange = vi.fn();

  function render(busy = false): void {
    act(() => {
      root.render(
        <PuzzleMapSwapDialog
          open
          onOpenChange={onOpenChange}
          current={current}
          busy={busy}
          onConfirm={onConfirm}
        />,
      );
    });
  }

  /** 候选行就是列表里的按钮（每项一个）。 */
  function itemButtons(): HTMLButtonElement[] {
    return Array.from(document.querySelectorAll<HTMLButtonElement>('button[aria-pressed]'));
  }

  const text = (): string => document.body.textContent ?? '';

  beforeEach(() => {
    state.versions = [];
    state.isLoading = false;
    state.navigate.mockClear();
    onConfirm.mockClear();
    onOpenChange.mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.innerHTML = '';
  });

  it('lists only published versions with the same grid size', () => {
    state.versions = [
      version({ mapId: 217, versionNo: 3, mapName: '当前这张' }),
      version({ mapId: 218, versionNo: 1, mapName: '同尺寸另一张' }),
      version({ mapId: 219, versionNo: 2, mapName: '九格那张', gridSize: 9 }),
    ];
    render();
    expect(itemButtons()).toHaveLength(1);
    expect(text()).toContain('同尺寸另一张');
    expect(text()).not.toContain('九格那张');
  });

  it('excludes the version the puzzle already points at', () => {
    state.versions = [version({ mapId: 217, versionNo: 3, mapName: '当前这张' })];
    render();
    expect(itemButtons()).toHaveLength(0);
    // 空态说清「没有其他同尺寸的版本」，而不是留一片空白。
    expect(text()).toContain('没有其他 6×6 的已发布地图版本');
  });

  it('states the current canvas so the user knows what is being replaced', () => {
    state.versions = [version({ mapId: 218, versionNo: 1, mapName: '同尺寸另一张' })];
    render();
    expect(text()).toContain('当前底图：');
    expect(text()).toContain('午夜花园');
    expect(text()).toContain('v3 · 6×6');
  });

  it('hands the selected version back to the page', () => {
    const target = version({ mapId: 218, versionNo: 1, mapName: '同尺寸另一张' });
    state.versions = [target];
    render();

    const confirm = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent === '引入',
    );
    expect(confirm?.disabled).toBe(true);

    act(() => itemButtons()[0]?.click());
    expect(itemButtons()[0]?.getAttribute('aria-pressed')).toBe('true');
    act(() => confirm?.click());
    expect(onConfirm).toHaveBeenCalledWith(target);
  });

  it('cannot be dismissed while the new canvas is being fetched', () => {
    state.versions = [version({ mapId: 218, versionNo: 1, mapName: '同尺寸另一张' })];
    render(true);
    const cancel = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent === '取消',
    );
    expect(cancel?.disabled).toBe(true);
    act(() => cancel?.click());
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
