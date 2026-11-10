import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapGameSummary, ThemeDifficultyTier } from '@loredoku/shared';
import { recordGameCompletion } from '@/lib/gameCompletion';
import { gameTimerKey } from '@/lib/gameTimer';
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

/** `themeCode → 分级`，由各用例自己摆。 */
const tiersByCode = new Map<string, readonly ThemeDifficultyTier[]>();

vi.mock('@/hooks/useGames', () => ({ useGames: () => gamesRef }));
vi.mock('@/hooks/useThemes', () => ({
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

  /**
   * v0.9.6：完成的关卡在列表页留三样东西 —— 封面上的**大面积覆盖（定案 + 印章）**、
   * 页脚那一格的**时间**、以及「完成优先，否则最后离开」的取舍。
   *
   * 覆盖现在**总是**出现（有完成记录就画）：v0.9.5 是「没印就整块不画」，理由是
   * 「空蒙版只会弄脏封面」；加了「定案」两个字之后这条理由不成立 —— 文字本身就说清
   * 了状态。印那一格仍然只在配了图时才有。
   */
  describe('已完成的谜题（v0.9.5 / v0.9.6）', () => {
    const stampUrl = '/api/files/themes/2/tool-icons/submit/a.webp';

    const covers = (): Array<HTMLElement> =>
      Array.from(document.querySelectorAll<HTMLElement>('[data-testid="game-completion-cover"]'));

    it('通过的关卡：封面盖「定案」+ 那枚印，页脚写完成用时；没通过的两样都没有', () => {
      gamesRef.data = [
        game({ id: 1, slug: 'done-one', gridSize: 5 }),
        game({ id: 2, slug: 'not-yet', gridSize: 5 }),
      ];
      recordGameCompletion('done-one', { gridSize: 5 }, { elapsedMs: 187_000, stampUrl });

      act(() => root.unmount());
      container.remove();
      mount();

      const cover = covers();
      expect(cover).toHaveLength(1);
      // v0.9.6：用户要求「已完成的谜题卡片在印章基础上添加『定案』两个字」。
      expect(cover[0]?.textContent).toContain('定案');
      expect(cover[0]?.querySelector('img')?.getAttribute('src')).toBe(stampUrl);

      const text = document.body.textContent ?? '';
      expect(text).toContain('03:07');
      // 只有一张卡有那一格。
      expect(document.querySelectorAll('[data-testid="game-completion-time"]')).toHaveLength(1);
      /* v0.9.7：完成用时那一格仍带时钟图标（只有相对时间那格不带）。 */
      expect(document.querySelectorAll('svg.lucide-clock')).toHaveLength(1);
    });

    it('没配印的通过记录：仍然盖「定案」那一层，只是没有印', () => {
      gamesRef.data = [game({ id: 1, slug: 'done-plain', gridSize: 5 })];
      recordGameCompletion('done-plain', { gridSize: 5 }, { elapsedMs: 65_000, stampUrl: null });

      act(() => root.unmount());
      container.remove();
      mount();

      const cover = covers();
      expect(cover).toHaveLength(1);
      expect(cover[0]?.textContent).toContain('定案');
      expect(cover[0]?.querySelector('[data-testid="verdict-stamp"]')).toBeNull();
      expect(document.body.textContent).toContain('01:05');
    });

    /** 网格对不上 = 另一道题：旧记录不认，卡片回到「没做过」的样子。 */
    it('网格变了就不算通过：旧记录整条作废', () => {
      gamesRef.data = [game({ id: 1, slug: 'rebuilt', gridSize: 6 })];
      recordGameCompletion('rebuilt', { gridSize: 4 }, { elapsedMs: 1000, stampUrl });

      act(() => root.unmount());
      container.remove();
      mount();

      expect(covers()).toHaveLength(0);
      expect(covers()).toHaveLength(0);
    });

    /**
     * 记下来的地址可能已经不在了（作者换过那枚图、包重新导出过）。破图标不能
     * 留在封面上 —— 加载失败就撤掉那枚印，「定案」与时间照常显示。
     */
    it('印的地址失效：只撤掉印那一张，「定案」与时间还在', () => {
      gamesRef.data = [game({ id: 1, slug: 'stale-stamp', gridSize: 5 })];
      recordGameCompletion('stale-stamp', { gridSize: 5 }, { elapsedMs: 42_000, stampUrl });

      act(() => root.unmount());
      container.remove();
      mount();

      const img = covers()[0]?.querySelector('img');
      expect(img).not.toBeNull();
      act(() => {
        img?.dispatchEvent(new Event('error'));
      });

      // 那一层（含「定案」）还在，只是印没了字还在。
      expect(covers()).toHaveLength(1);
      expect(covers()[0]?.querySelector('[data-testid="verdict-stamp"]')).toBeNull();
      expect(document.body.textContent).toContain('00:42');
    });

    /**
     * v0.9.7：没完成但玩过的关卡，那一格显示**相对时间**（「刚刚 / N 分钟前」），
     * 不再显示计时读数。用动态时间戳，免得断言随墙上时钟漂移。
     */
    it('没完成但玩过：显示「N 分钟前」这样的相对时间', () => {
      gamesRef.data = [game({ id: 1, slug: 'left-before', gridSize: 5 })];
      window.localStorage.setItem(
        gameTimerKey('left-before'),
        JSON.stringify({
          gridSize: 5,
          participantCount: 1,
          elapsedMs: 30_000,
          leftAt: new Date(Date.now() - 3 * 60_000).toISOString(),
        }),
      );

      act(() => root.unmount());
      container.remove();
      mount();

      expect(covers()).toHaveLength(0);
      expect(document.querySelector('[data-testid="game-last-left"]')?.textContent).toContain(
        '3 分钟前',
      );
      /* v0.9.7：相对时间那一格**不画时钟图标**（图标只配完成用时）。 */
      expect(document.querySelector('svg.lucide-clock')).toBeNull();
    });

    /** v0.9.7：从未玩过的游戏，时间格连图标一起不画。 */
    it('未开始的游戏：不展示时间，也没有时间图标', () => {
      gamesRef.data = [game({ id: 1, slug: 'never-played', gridSize: 5 })];

      act(() => root.unmount());
      container.remove();
      mount();

      expect(covers()).toHaveLength(0);
      expect(document.querySelector('[data-testid="game-completion-time"]')).toBeNull();
      expect(document.querySelector('[data-testid="game-last-left"]')).toBeNull();
      expect(document.querySelector('[data-testid="game-no-time"]')).toBeNull();
      // 卡片里唯一的时钟图标就是时间格那一枚。
      expect(document.querySelector('svg.lucide-clock')).toBeNull();
    });

    /**
     * v0.9.7：**定案的卡片不演鼠标光源动效**。
     *
     * 断言的是「光层在不在 / 封面还接不接 pointermove」这两个行为，不是颜色或
     * 排版。没完成的卡仍要有光层 —— 别把整站的光源一起关掉。
     */
    it('定案卡不画鼠标光层，未完成的卡仍有光层', () => {
      gamesRef.data = [
        game({ id: 1, slug: 'done-one', gridSize: 5 }),
        game({ id: 2, slug: 'fresh-one', gridSize: 5 }),
      ];
      recordGameCompletion('done-one', { gridSize: 5 }, { elapsedMs: 187_000, stampUrl: null });

      act(() => root.unmount());
      container.remove();
      mount();

      const covers = Array.from(
        document.querySelectorAll<HTMLElement>('[data-testid="game-cover"]'),
      );
      expect(covers).toHaveLength(2);
      const glows = covers.map((cover) => cover.querySelectorAll('[data-testid="game-glow"]').length);
      // 第一张是定案卡：0 层光；第二张没完成：光源照旧。
      expect(glows[0]).toBe(0);
      expect(glows[1]).toBeGreaterThan(0);
    });

    /** v0.9.7：只有计时存档、没有离开时刻的旧数据 —— 不画孤零零的时间图标。 */
    it('旧计时存档（无 leftAt）：不展示时间图标', () => {
      gamesRef.data = [game({ id: 1, slug: 'legacy-timer', gridSize: 5 })];
      window.localStorage.setItem(
        gameTimerKey('legacy-timer'),
        JSON.stringify({ gridSize: 5, participantCount: 1, elapsedMs: 30_000 }),
      );

      act(() => root.unmount());
      container.remove();
      mount();

      expect(document.querySelector('svg.lucide-clock')).toBeNull();
      expect(document.querySelector('[data-testid="game-last-left"]')).toBeNull();
    });
  });

});
