import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapGameSummary, ThemeDeploymentSummary } from '@loredoku/shared';
import { GamesPage } from './GamesPage';

/**
 * v0.8.2：玩家侧 → 制作侧的**唯一那道门**（右上角「进入工坊」）。
 *
 * 它原来落 `/maps`。可工作空间从 v0.8.0 起有自己的首页（`/:code/overview`，也是
 * 导航第一项）—— 只有这枚从外面进来的按钮还落在某一间房里。这里钉住它落概览。
 */

const gamesRef: { data: MapGameSummary[]; isLoading: boolean; error: null; refetch: () => void } = {
  data: [],
  isLoading: false,
  error: null,
  refetch: () => undefined,
};
const deploymentsRef: { data: ThemeDeploymentSummary[]; isLoading: boolean; error: null } = {
  data: [],
  isLoading: false,
  error: null,
};

vi.mock('@/hooks/useGames', () => ({ useGames: () => gamesRef }));
vi.mock('@/hooks/useThemes', () => ({ useThemeDeployments: () => deploymentsRef }));

function PathProbe(): JSX.Element {
  const location = useLocation();
  return <p data-testid="path">{location.pathname}</p>;
}

describe('GamesPage · 进入工坊的口（v0.8.2）', () => {
  let container: HTMLDivElement;
  let root: Root;

  const path = (): string => document.querySelector('[data-testid="path"]')?.textContent ?? '';
  const button = (label: string): HTMLButtonElement | undefined =>
    Array.from(document.querySelectorAll('button')).find(
      (node) => node.textContent?.trim().includes(label) === true,
    );

  beforeEach(() => {
    window.localStorage.clear();
    // `workshopPath` 靠这个记住的工作空间拼地址（没有它只会回 `/`）。
    window.localStorage.setItem('loredoku.lastTheme', 'hlm');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/play']}>
          <GamesPage />
          <Routes>
            <Route path="*" element={<PathProbe />} />
          </Routes>
        </MemoryRouter>,
      );
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    window.localStorage.clear();
  });

  it('进工坊落到概览，不是地图', () => {
    const entry = button('进入工坊');
    expect(entry).toBeDefined();
    act(() => entry?.click());

    expect(path()).toBe('/hlm/overview');
  });
});
