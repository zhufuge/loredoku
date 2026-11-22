import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapGameSummary, Theme, ThemeData } from '@loredoku/shared';
import { recordGameCompletion } from '@/lib/gameCompletion';
import { gameTimerKey } from '@/lib/gameTimer';
import { GamesPage } from './GamesPage';

/** 玩家侧 → 制作侧的**唯一那道门**（右上角「进入工坊」）。 工作空间有自己的首页（`/:code/overview`，也是导航第一项），这枚从外面进来的按钮也落概览 —— 这里钉住它。 v0.8.6 §3.6：这一页的难度徽章按关卡的 `themeCode` 查主题配的分级（这页在工作空间外面，读不到主题内置的五档叫法）—— 后半段钉这条。 */

const gamesRef: { data: MapGameSummary[]; isLoading: boolean; error: null; refetch: () => void } = {
  data: [],
  isLoading: false,
  error: null,
  refetch: () => undefined,
};

/** 这一页是「一个主题的关卡列表」—— 主题自己带名字、描述、分级和那两行文案，所以 `useThemes` 也得摆一份出来。 */
const themesRef: { data: Theme[]; isLoading: boolean; error: null } = {
  data: [],
  isLoading: false,
  error: null,
};

function theme(code: string, data: Partial<ThemeData> = {}, name = code): Theme {
  return { id: 1, code, name, description: null, data } as unknown as Theme;
}

/** 预加载由 `useImagePreload` 负责（它自己的用例在 `src/hooks/useImagePreload.test.tsx`，替掉全局 `Image` 自己派发 load）。 这一层只钉「页面拿这些地址去等、等到才撤 loading」，所以把 hook 换成开关， 顺手把传进去的地址记下来。 */
const preloadRef: { ready: boolean; urls: string[] } = { ready: true, urls: [] };

vi.mock('@/hooks/useGames', () => ({ useGames: () => gamesRef }));
vi.mock('@/hooks/useImagePreload', () => ({
  useImagePreload: (urls: string[]) => {
    preloadRef.urls = urls;
    return preloadRef.ready;
  },
}));
vi.mock('@/hooks/useThemes', () => ({ useThemes: () => themesRef }));

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

  function mount(initialPath = '/play'): void {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path="/play" element={<GamesPage />} />
            <Route path="/:themeCode/play" element={<GamesPage />} />
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
    // 上一个用例可能把开关拨到「还在加载」/「封面没就绪」，这里拨回来。
    gamesRef.isLoading = false;
    preloadRef.ready = true;
    preloadRef.urls = [];
    themesRef.data = [];
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

  /** `/:code/play` 只列这个主题的关卡，徽章用这个主题配的分级。 地址里带着主题编码，分级只有一份（同一个第 2 档不会在一张页上有两个叫法）—— 别的主题的关卡连出现的机会都不该有。 */
  it('按主题展示：只列这个主题的关卡，用它的分级叫法', () => {
    gamesRef.data = [
      game({ id: 1, themeCode: 'hlm', difficulty: 2, slug: 'in-hlm' }),
      game({ id: 2, themeCode: 'xyj', difficulty: 2, slug: 'in-xyj' }),
    ];
    themesRef.data = [
      theme('hlm', { difficultyLevels: [{ level: 1, label: '初' }, { level: 2, label: '通' }] }, '红楼梦'),
    ];

    act(() => root.unmount());
    container.remove();
    mount('/hlm/play');

    const text = document.body.textContent ?? '';
    expect(text).toContain('红楼梦');
    expect(text).toContain('通');
    // 另一个主题的关卡与它的叫法都不该出现。
    expect(text).not.toContain('圣');
    expect(document.body.textContent).not.toContain('关卡 2');
  });

  /** 主题没配分级时退回内置五档，画面不能空着。 */
  it('主题没配分级时退回内置五档', () => {
    gamesRef.data = [game({ id: 1, themeCode: 'hlm', difficulty: 2 })];
    themesRef.data = [theme('hlm')];

    act(() => root.unmount());
    container.remove();
    mount('/hlm/play');

    expect(document.body.textContent).toContain('简单');
  });

  /** 完成的关卡在列表页留三样东西 —— 封面上的**大面积覆盖（定案 + 印章）**、 页脚那一格的**时间**、以及「完成优先，否则最后离开」的取舍。 覆盖**总是**出现（有完成记录就画）；印那一格只在配了图时才有。 */
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
      // 已完成的谜题卡片在印章基础上还要有『定案』两个字。
      expect(cover[0]?.textContent).toContain('定案');
      expect(cover[0]?.querySelector('img')?.getAttribute('src')).toBe(stampUrl);

      const text = document.body.textContent ?? '';
      expect(text).toContain('03:07');
      // 只有一张卡有那一格。
      expect(document.querySelectorAll('[data-testid="game-completion-time"]')).toHaveLength(1);
      /* 完成用时那一格仍带时钟图标（只有相对时间那格不带）。 */
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

    /** 记下来的地址可能已经不在了（作者换过那枚图、包重新导出过）。破图标不能留在封面上 —— 加载失败就撤掉那枚印，「定案」与时间照常显示。 */
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

    /** 没完成但玩过的关卡，那一格显示**相对时间**（「刚刚 / N 分钟前」）， 不显示计时读数。用动态时间戳，免得断言随墙上时钟漂移。 */
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
      /* 相对时间那一格**不画时钟图标**（图标只配完成用时）。 */
      expect(document.querySelector('svg.lucide-clock')).toBeNull();
    });

    /** 从未玩过的游戏，时间格连图标一起不画。 */
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

    /** **定案的卡片不演鼠标光源动效**。 断言的是「光层在不在 / 封面还接不接 pointermove」这两个行为，不是颜色或排版。没完成的卡仍要有光层 —— 别把整站的光源一起关掉。 */
    it('定案卡不画鼠标光层，未完成的卡仍有光层', () => {
      gamesRef.data = [
        game({ id: 1, slug: 'done-one', gridSize: 5 }),
        game({ id: 2, slug: 'fresh-one', gridSize: 5 }),
      ];
      recordGameCompletion('done-one', { gridSize: 5 }, { elapsedMs: 187_000, stampUrl: null });

      act(() => root.unmount());
      container.remove();
      mount();

      const coverNodes = Array.from(
        document.querySelectorAll<HTMLElement>('[data-testid="game-cover"]'),
      );
      expect(coverNodes).toHaveLength(2);
      const glows = coverNodes.map((cover) => cover.querySelectorAll('[data-testid="game-glow"]').length);
      // 第一张是定案卡：0 层光；第二张没完成：光源照旧。
      expect(glows[0]).toBe(0);
      expect(glows[1]).toBeGreaterThan(0);
    });

    /** 只有计时存档、没有离开时刻的旧数据 —— 不画孤零零的时间图标。 */
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

  /** loading 等「当前页资源全部加载完」才撤。列表页的资源是封面图。 */
  describe('v0.11.2 loading 等封面图', () => {
    const covers = (): number =>
      document.querySelectorAll('[data-testid="game-cover"]').length;

    beforeEach(() => {
      gamesRef.isLoading = false;
      gamesRef.error = null;
      preloadRef.ready = true;
      preloadRef.urls = [];
      gamesRef.data = [];
    });

    afterEach(() => {
      preloadRef.ready = true;
    });

    it('数据到了但封面还没就绪：仍是加载态，卡片不先跳出来', () => {
      preloadRef.ready = false;
      gamesRef.data = [
        game({ id: 1, slug: 'cover-one', gridSize: 5, coverUrl: '/api/files/themes/1/cover-a.webp' }),
      ];
      act(() => root.unmount());
      container.remove();
      mount();

      expect(covers()).toBe(0);

      preloadRef.ready = true;
      act(() => root.unmount());
      container.remove();
      mount();

      expect(covers()).toBe(1);
    });

    it('把这一页的封面地址交给预加载去等', () => {
      gamesRef.data = [
        game({ id: 1, slug: 'cover-a', gridSize: 5, coverUrl: '/api/files/themes/1/cover-a.webp' }),
        game({ id: 2, slug: 'no-cover', gridSize: 5, coverUrl: null }),
        game({ id: 3, slug: 'cover-b', gridSize: 5, coverUrl: '/api/files/themes/1/cover-b.webp' }),
      ];
      act(() => root.unmount());
      container.remove();
      mount();

      expect(preloadRef.urls).toEqual([
        '/api/files/themes/1/cover-a.webp',
        '/api/files/themes/1/cover-b.webp',
      ]);
    });

    it('没有封面的关卡不拖住整页：没有图要等，数据到就出', () => {
      gamesRef.data = [game({ id: 1, slug: 'no-cover', gridSize: 5, coverUrl: null })];
      act(() => root.unmount());
      container.remove();
      mount();

      expect(preloadRef.urls).toEqual([]);
      expect(covers()).toBe(1);
    });

    it('数据本身还在路上时，光封面就绪也不算完', () => {
      gamesRef.isLoading = true;
      gamesRef.data = [];
      act(() => root.unmount());
      container.remove();
      mount();

      expect(covers()).toBe(0);
    });
  });

  /** 列表页顶上那两行字。 它们是**主题的口气**，不是全站统一文案 —— 与难度分级同一类东西。默认那两句是内置的，主题配过就用配的（`{n}` 换成数字）。 */
  describe('v0.11.6 计数行：N 关可玩 / 已通过 N 关', () => {
    const passedCount = (): string | null =>
      document.querySelector('[data-testid="games-passed-count"]')?.textContent ?? null;

    it('没配过就用内置那两句', () => {
      gamesRef.data = [game({ id: 1, themeCode: 'hlm' }), game({ id: 2, themeCode: 'hlm' })];
      themesRef.data = [theme('hlm', {}, '红楼梦')];
      act(() => root.unmount());
      container.remove();
      mount('/hlm/play');

      expect(document.body.textContent).toContain('2 关可玩');
      expect(passedCount()).toBeNull();
    });

    it('主题配过就用配的，{n} 换成关数', () => {
      gamesRef.data = [game({ id: 1, themeCode: 'hlm' }), game({ id: 2, themeCode: 'hlm' })];
      themesRef.data = [
        theme('hlm', { gameList: { playable: '共 {n} 回', passed: '已了 {n} 桩' } }, '红楼梦'),
      ];
      act(() => root.unmount());
      container.remove();
      mount('/hlm/play');

      expect(document.body.textContent).toContain('共 2 回');
      expect(passedCount()).toBeNull();
    });

    it('通过一关，那个数字跟着变', () => {
      gamesRef.data = [game({ id: 1, themeCode: 'hlm', slug: 'done', gridSize: 5 })];
      themesRef.data = [theme('hlm', {}, '红楼梦')];
      recordGameCompletion('done', { gridSize: 5 }, { elapsedMs: 61000, stampUrl: null });
      act(() => root.unmount());
      container.remove();
      mount('/hlm/play');

      expect(passedCount()).toBe('已通过 1 关');
    });
  });

  /** 难度过滤。默认「全部」；点某一档只留那一档；再点「全部」回来。 切档时**计数行不跟着变** —— 「已通过 N 关」说的是这个主题一共过了几关， 换个看法不该让它变小。 */
  describe('v0.11.6 难度过滤', () => {
    const chips = (): HTMLButtonElement[] =>
      Array.from(document.querySelectorAll<HTMLButtonElement>('[data-testid="games-difficulty-filter"] button'));
    const covers = (): number => document.querySelectorAll('[data-testid="game-cover"]').length;

    function setup(): void {
      gamesRef.data = [
        game({ id: 1, themeCode: 'hlm', difficulty: 1, slug: 'easy-one' }),
        game({ id: 2, themeCode: 'hlm', difficulty: 2, slug: 'hard-one' }),
      ];
      themesRef.data = [
        theme('hlm', { difficultyLevels: [{ level: 1, label: '初' }, { level: 2, label: '通' }] }, '红楼梦'),
      ];
      act(() => root.unmount());
      container.remove();
      mount('/hlm/play');
    }

    it('「全部」在最前，后面是这个主题的每一档', () => {
      setup();

      expect(chips().map((chip) => chip.textContent?.trim())).toEqual(['全部', '初', '通']);
      expect(chips()[0]?.getAttribute('aria-pressed')).toBe('true');
    });

    it('点某一档只留那一档，点「全部」回来', () => {
      setup();
      expect(covers()).toBe(2);

      act(() => chips()[2]?.click());
      expect(covers()).toBe(1);
      expect(document.body.textContent).not.toContain('关卡 1');

      act(() => chips()[0]?.click());
      expect(covers()).toBe(2);
    });

    it('切档不改变「已通过 N 关」', () => {
      setup();
      recordGameCompletion('easy-one', { gridSize: 5 }, { elapsedMs: 61000, stampUrl: null });
      act(() => root.unmount());
      container.remove();
      mount('/hlm/play');

      const before = document.querySelector('[data-testid="games-passed-count"]')?.textContent;
      expect(before).toBe('已通过 1 关');

      act(() => chips()[2]?.click());

      expect(document.querySelector('[data-testid="games-passed-count"]')?.textContent).toBe(before);
    });

    it('这一档没有关卡时给回「全部」的出口', () => {
      gamesRef.data = [game({ id: 1, themeCode: 'hlm', difficulty: 1, slug: 'easy-one' })];
      themesRef.data = [
        theme('hlm', { difficultyLevels: [{ level: 1, label: '初' }, { level: 2, label: '通' }] }, '红楼梦'),
      ];
      act(() => root.unmount());
      container.remove();
      mount('/hlm/play');

      act(() => chips()[2]?.click());

      expect(covers()).toBe(0);
      expect(document.body.textContent).toContain('空白纸，未落笔。');
      act(() => button('看全部')?.click());
      expect(covers()).toBe(1);
    });
  });

  /** 卡片与「进入工坊」都带着当前主题编码走。 */
  it('带主题编码进来时，进工坊落到这个主题的概览', () => {
    themesRef.data = [theme('hlm', {}, '红楼梦')];
    act(() => root.unmount());
    container.remove();
    mount('/hlm/play');

    act(() => button('进入工坊')?.click());

    expect(path()).toBe('/hlm/overview');
  });

});
