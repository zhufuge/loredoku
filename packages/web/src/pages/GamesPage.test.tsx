import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapGameSummary, ThemeDeploymentSummary, ThemeDifficultyTier } from '@loredoku/shared';
import { GamesPage } from './GamesPage';

/**
 * v0.8.2：玩家侧 → 制作侧的**唯一那道门**（右上角「进入工坊」）。
 *
 * 它原来落 `/maps`。可工作空间从 v0.8.0 起有自己的首页（`/:code/overview`，也是
 * 导航第一项）—— 只有这枚从外面进来的按钮还落在某一间房里。这里钉住它落概览。
 *
 * v0.8.6 §3.6：这一页的难度徽章原来一律是内置五档的叫法（页在工作空间外面，
 * 徽章读不到主题）。现在按关卡的 `themeCode` 查主题配的分级 —— 后半段钉这条。
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

/** `themeCode → 分级`，由各用例自己摆。 */
const tiersByCode = new Map<string, readonly ThemeDifficultyTier[]>();

vi.mock('@/hooks/useGames', () => ({ useGames: () => gamesRef }));
vi.mock('@/hooks/useThemes', () => ({
  useThemeDeployments: () => deploymentsRef,
  useDifficultyTiersByCode: () => (code: string | null | undefined) =>
    code ? tiersByCode.get(code) : undefined,
}));

function game(overrides: Partial<MapGameSummary> & { id: number }): MapGameSummary {
  return {
    puzzleId: overrides.id * 10,
    themeCode: 'hlm',
    puzzleName: `谜题 ${overrides.id}`,
    puzzleVersionNo: 1,
    name: `关卡 ${overrides.id}`,
    slug: `level-${overrides.id}`,
    coverUrl: null,
    difficulty: 2,
    sortWeight: 0,
    gridSize: 5,
    participantCount: 1,
    createdAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

function PathProbe(): JSX.Element {
  const location = useLocation();
  return <p data-testid="path">{location.pathname}</p>;
}

describe('GamesPage', () => {
  let container: HTMLDivElement;
  let root: Root;

  const path = (): string => document.querySelector('[data-testid="path"]')?.textContent ?? '';
  const button = (label: string): HTMLButtonElement | undefined =>
    Array.from(document.querySelectorAll('button')).find(
      (node) => node.textContent?.trim().includes(label) === true,
    );

  function mount(): void {
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
  }

  beforeEach(() => {
    window.localStorage.clear();
    // `workshopPath` 靠这个记住的工作空间拼地址（没有它只会回 `/`）。
    window.localStorage.setItem('loredoku.lastTheme', 'hlm');
    gamesRef.data = [];
    deploymentsRef.data = [];
    tiersByCode.clear();
    mount();
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

  /**
   * 两个主题的关卡并排站在「单个游戏」段里，第 2 档一个叫「通」、一个叫「圣」。
   *
   * 按主题查而不是取第一份分级：这正是 `themeCode` 存在的意义 —— 同一张页上不可能
   * 只有一个主题的关卡，写死一份就会让另一半显示成别人的叫法。
   */
  it('难度用每关所属主题配的字样，不用内置五档', () => {
    gamesRef.data = [
      game({ id: 1, themeCode: 'hlm', difficulty: 2 }),
      game({ id: 2, themeCode: 'xyj', difficulty: 2 }),
    ];
    tiersByCode.set('hlm', [
      { level: 1, label: '初' },
      { level: 2, label: '通' },
    ]);
    tiersByCode.set('xyj', [
      { level: 1, label: '凡' },
      { level: 2, label: '圣' },
    ]);

    act(() => root.unmount());
    container.remove();
    mount();

    const text = document.body.textContent ?? '';
    expect(text).toContain('通');
    expect(text).toContain('圣');
    // 内置五档里第 2 档叫「简单」—— 它一次都不该出现。
    expect(text).not.toContain('简单');
  });

  /** 主题还没取回来（或主题里根本没配）时退回内置五档，画面不能空着。 */
  it('查不到分级时退回内置五档', () => {
    gamesRef.data = [game({ id: 1, themeCode: 'hlm', difficulty: 2 })];

    act(() => root.unmount());
    container.remove();
    mount();

    expect(document.body.textContent).toContain('简单');
  });
});
