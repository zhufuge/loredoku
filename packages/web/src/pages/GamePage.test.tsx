import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GAME_CHECK_STEP_MS,
  GAME_VERDICT_HOLD_MS,
  UI_Z,
  DEFAULT_CELL_SIZE,
  ITEM_HOVER_LIFT_PX,
  ITEM_NAME_TIP_DELAY_MS,
} from '@loredoku/shared';
import { DIALOG_OVERLAY_TINT_CLASS } from '@/components/ui/dialog';
import type { Asset, UploadedImage, GameToolIcons, ThemeCheckColors, ThemeRing, ThemeVerdict } from '@loredoku/shared';
import { installMatchMedia, type MatchMediaStub } from '@/testing/matchMedia';
import { imageTintMatrix } from '@/components/common/PressRing';
import { GAME_PROGRESS_VERSION, gameProgressKey } from '@/lib/gameProgress';
import { readGameCompletion, recordGameCompletion } from '@/lib/gameCompletion';
import { gameTimerKey } from '@/lib/gameTimer';
import ApiGamePage from './ApiGamePage';

/** 页面级只钉对外可观察结果（用时 / 百分比 / 弹窗 / 棋盘）；存档与计时的清洗规则见 `gameProgress.test.ts` / `gameTimer.test.ts`（docs/v0.6.2.md §3 / §4）。 */

const fixture = vi.hoisted(() => ({
  /**
   * 这一关的数据还在路上（真浏览器里的第一拍）。用例用完记得放回 `false`。
   */
  detailPending: false,
  /** 整份关卡清单（`/api/games` 那一份，按作者排好的先后）。定案卡的「下一关」从它算出来；每个用例可以改它（`useGames` 的 mock 读同一份）。 */
  catalog: [
    { slug: 'night-train', gridSize: 9 },
    { slug: 'day-boat', gridSize: 5 },
    { slug: 'dusk-tower', gridSize: 6 },
  ] as Array<{ slug: string; gridSize: number }>,
  /** v0.8.7 §4：主题的标记（主题概览页那份）。`useForbiddenSymbolByCode` 的 mock 读它，于是「谜题没配 → 跟随主题」这条能在页面级断言。 */
  theme: {
    mark: null as UploadedImage | null,
    /** v0.8.7 §7：主题那一套工具按钮图标；默认没配。 */
    toolIcons: null as GameToolIcons | null,
    /** v0.9.3 §7；v0.9.5：主题的两档校验颜色；默认没配。 */
    checkStyle: null as ThemeCheckColors | null,
    /** v0.9.2 §2；v0.9.5 合并：主题的**那一圈**图（长按 + 校验共用）；默认没配。 */
    ring: null as ThemeRing | null,
    /** 结算卡的图标与标题。默认没配 —— 落回内置的 🎉 +「解题成功」， 正是老主题的行为，所以既有的结算卡断言不用改。 */
    verdict: null as ThemeVerdict | null,
  },
  detail: {
    id: 1,
    puzzleId: 7,
    puzzleName: '夜车',
    puzzleVersionNo: 1,
    name: '夜车',
    slug: 'night-train',
    themeCode: 'hlm',
    coverUrl: null,
    difficulty: 2,
    gridSize: 9,
    participantCount: 3,
    createdAt: '2026-01-01T00:00:00.000Z',
    // v0.7.1 §7.3：游戏直接读谜题版本行 —— 画布与名册都在它身上，没有快照拷贝。
    map: { version: 7, gridSize: 9, cells: {}, regions: [] },
    puzzle: {
      version: 2,
      map: {
        mapId: 1,
        versionNo: 1,
        mapName: '夜车',
        data: { version: 7, gridSize: 9, cells: {}, regions: [] },
      },
      name: '夜车',
      description: '三人三行，各归其位。',
      // 题面（全局线索 + 结束语）随谜题版本行一起下发。
      clues: ['同一行里没有重复编号', '阴影里没有编号'],
      ending: '灯灭了，花园还在。',
      characterSlots: [
        { characterId: 11, themeColor: '#AA0000' },
        { characterId: 12, themeColor: '#00AA00' },
        { characterId: 13, themeColor: '#0000AA' },
      ],
      linkageColors: [],
      // v0.6.3 §3.4: the layout the puzzle was published with.
      rosterCols: 3,
      // 默认没配置 —— 这一页的老行为（`×` 字形）必须先原样成立。
      mark: null as UploadedImage | null,
      /** v0.8.7 §7：谜题自己那一套工具按钮图标；默认没配。 */
      toolIcons: null as GameToolIcons | null,
    },
  },
}));

vi.mock('@/hooks/useGames', () => ({
  /** `useCatalog` 读的是**同一个** `useGames()`（`ApiGameSource` 里就是它）。 这里给一份清单，「下一关」才有的可算；`catalog` 是可变夹具，用例按需改。 `detailPending` 也是夹具：真浏览器里数据是异步到的，页面会先渲染一次「画布还没到」（`gridSize = 0`）的形态。续计时那个 bug 只在那一拍上出现。 */
  useGameDetail: () =>
    fixture.detailPending
      ? { data: undefined, isLoading: true, isError: false }
      : { data: fixture.detail, isLoading: false, isError: false },
  useGames: () => ({ data: fixture.catalog, isLoading: false, isError: false, error: null }),
}));
const assetsRef: { data: Asset[] | null; isLoading: boolean; isError: boolean } = {
  data: [],
  isLoading: false,
  isError: false,
};
vi.mock('@/hooks/useAssets', () => ({ useAssets: () => assetsRef }));

/** 一件带一张图的物品资源 —— 只填这一页会读到的那几个字段。 */
function asset(id: number, name: string, imageUrl: string | null): Asset {
  return {
    id,
    code: `asset_${id}`,
    name,
    type: 'item',
    blocking: false,
    isActive: true,
    variants: [
      {
        id: id * 10,
        assetId: id,
        name: `${name}的形态`,
        sortOrder: 0,
        fitMode: 'contain',
        imagePath: null,
        imageUrl,
        imageThumbUrl: imageUrl,
        bgColor: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

/** 图片预加载由 `useImagePreload` 负责（它自己的用例在 `src/hooks/useImagePreload.test.tsx`）。 这一层只钉「页面把这些图交给它等、等到才撤 loading」，所以这里放一个开关， 顺手把传进去的地址记下来。 */
const preloadRef: { ready: boolean; urls: string[] } = { ready: true, urls: [] };
vi.mock('@/hooks/useImagePreload', () => ({
  useImagePreload: (urls: string[]) => {
    preloadRef.urls = urls;
    return preloadRef.ready;
  },
}));
vi.mock('@/hooks/useThemes', () => ({
  /** v0.8.7 §4；v0.9.5 更名：标记的「跟随主题」那一档。真实 hook 返回「按编码查表」 的函数，这里按同一个签名返回一个常量。 */
  useMarkByCode: () => () => fixture.theme.mark,
  /** v0.9.2 §2；v0.9.5：**那一圈** —— 长按计时环与校验圈共用一张。这一套里由 `fixture.theme.ring` 决定，默认「没配」。 */
  useRingByCode: () => () => fixture.theme.ring,
  // v0.9.3 §3：校验的两档颜色 —— 默认不配，落回内置绿 / 红。
  useCheckColorsByCode: () => () => fixture.theme.checkStyle,
  /** 结算卡的图标与标题 —— 同样按编码查表。默认「没配」， `resolveVerdictStyle` 会填 🎉 +「解题成功」。 */
  useVerdictByCode: () => () => fixture.theme.verdict,
  /** v0.8.7 §7：三枚工具按钮图标。同样按编码查表，这里返回 fixture 里那一套（默认 `null` = 谁都没配，按钮画内置图标）。 */
  useToolIconsByCode: () => () => fixture.theme.toolIcons,
  /** 标尺的行列符号只由主题配置 —— 同样按编码查表。这一套里没配， 落回出厂的 `C` / `R`。 */
  useRulerSymbolsByCode: () => () => ({ columnSymbol: 'C', rowSymbol: 'R' }),
}));
vi.mock('@/hooks/useCharacters', () => ({ useCharacters: () => ({ data: [] }) }));
vi.mock('@/hooks/useHighlight', () => ({
  useHighlight: () => ({
    highlight: null,
    show: () => undefined,
    clear: () => undefined,
    leaving: false,
  }),
}));
vi.mock('sonner', () => ({ toast: { success: () => undefined, error: () => undefined } }));

// React 18 的 act 需要这个开关，否则每次由 effect 触发的更新都会打印一条警告。
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let media: MatchMediaStub;

beforeAll(() => {
  media = installMatchMedia(false);
});

afterAll(() => {
  media.restore();
});

/** 结算卡上两枚跳转按钮真的把地址改了 —— 只读它，不渲染目标页。 */
function PathProbe(): JSX.Element {
  const location = useLocation();
  return <p data-testid="route-path">{location.pathname}</p>;
}

/** 「下一关」的真实路径 = **同一个 router 内换地址**。 把 `useNavigate()` 挂到一个不渲染任何东西的组件上，用例就能在同一个 router 实例里跳转 —— 这是「组件不重建、状态可能串过去」唯一能被测到的形态。 */
let routerNavigate: ((target: string) => void) | null = null;

function NavigateProbe(): null {
  routerNavigate = useNavigate();
  return null;
}

describe('GamePage — 本地存档与视图缩放（v0.6.2）', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.localStorage.clear();
    fixture.detailPending = false;
    // 换关用例改过 slug / gridSize —— 它们是同一个夹具对象，必须逐条还原，
    // 否则后面所有用例都在「5×5 的 day-boat」上跑。
    fixture.detail.slug = 'night-train';
    fixture.detail.gridSize = 9;
    fixture.detail.puzzle.mark = null;
    fixture.theme.mark = null;
    // v0.9.0 §17：这两套也是 fixture 上的可变状态 —— 不重置的话，图标用例里配的
    // 那几张图会漏到后面的右栏布局用例里（它们要求「谁都没配」）。
    fixture.detail.puzzle.toolIcons = null;
    fixture.theme.toolIcons = null;
    // v0.9.3 §7：圈图与两档颜色也是 fixture 上的可变状态，别漏到别的用例。
    fixture.theme.checkStyle = null;
    // 那一圈同样是可变夹具（长按 + 校验共用）。
    fixture.theme.ring = null;
    // 结算卡的图标与标题也是夹具，别漏到后面的用例。
    fixture.theme.verdict = null;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      },
    );
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  function render(): void {
    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/play/night-train']}>
          <Routes>
            <Route path="/play/:slug" element={<ApiGamePage />} />
            {/* 跳走之后那一页不必渲染，但路由表里得有一个落点，否则 router 会警告。 */}
            <Route path="*" element={null} />
          </Routes>
          {/* 结算卡上的「下一关 / 返回谜题列表」跳到哪儿 —— 只读地址。 */}
          <PathProbe />
          {/* 让用例能在同一个 router 里换关（见 `NavigateProbe`）。 */}
          <NavigateProbe />
        </MemoryRouter>,
      );
    });
  }

  /** 在**同一个 router** 里换关 —— 模拟「下一关」的真实路径。 用 `<MemoryRouter>` + `navigate()` 而不是重新 `root.render(...)`：后者会换掉整棵树，测不到「组件不重建 → 状态串过去」这件事，而那正是这一组用例要抓的。 */
  function navigateTo(nextSlug: string): void {
    act(() => {
      routerNavigate?.(`/play/${nextSlug}`);
    });
  }

  const path = (): string =>
    document.querySelector('[data-testid="route-path"]')?.textContent ?? '';

  /** jsdom 的元素尺寸恒为 0，而 `fit` / `zoomBy` 都要读真实矩形才有意义。 给中列一个固定视口，缩放与重置才会落到可断言的数值上。 */
  function sizeCanvas(): void {
    const main = container.querySelector('main');
    if (!main) throw new Error('画布容器没渲染出来');
    main.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 900,
        height: 700,
        right: 900,
        bottom: 700,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
  }

  function seedSave(payload: Record<string, unknown>): void {
    window.localStorage.setItem(
      gameProgressKey('night-train'),
      JSON.stringify({
        v: GAME_PROGRESS_VERSION,
        gridSize: 9,
        participantCount: 3,
        board: {},
        ...payload,
      }),
    );
  }

  /** `/api/files/…` 那一份印 —— 只是地址，不需要真的能加载。 */
  const SUBMIT_STAMP_PATH = 'puzzles/7/tool-icons/submit/a.webp';
  const SUBMIT_STAMP_URL = `/api/files/${SUBMIT_STAMP_PATH}`;

  /** 三位在互不相同的行与列上 —— 客户端校验通过。 */
  function seedPassingBoard(): void {
    seedSave({
      board: {
        '0,0': { kind: 'participant', index: 1 },
        '1,1': { kind: 'participant', index: 2 },
        '2,2': { kind: 'participant', index: 3 },
      },
    });
  }

  /** 1、2 同列 —— 未通过。 */
  function seedFailingBoard(): void {
    seedSave({
      board: {
        '0,0': { kind: 'participant', index: 1 },
        '0,1': { kind: 'participant', index: 2 },
        '5,5': { kind: 'participant', index: 3 },
      },
    });
  }

  /** 点提交、把逐人校验推完，等结算卡落下来。 */
  /** 点提交、把逐人校验推完，等结算卡落下来。 **通过**时多一段「定案遮罩停一秒再弹窗」，所以这里最后再推一次 `GAME_VERDICT_HOLD_MS`。未通过不受影响（那一路立刻弹）。 */
  function submitAndSettle(): void {
    act(() => container.querySelector<HTMLButtonElement>('button[title="提交"]')?.click());
    for (let i = 0; i < 4; i += 1) act(() => vi.advanceTimersByTime(GAME_CHECK_STEP_MS));
    act(() => vi.advanceTimersByTime(GAME_VERDICT_HOLD_MS));
  }

  function footerButton(label: string): HTMLButtonElement | undefined {
    return Array.from(
      document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button'),
    ).find((node) => node.textContent?.trim() === label);
  }

  /** 一进页面就把存档恢复回来：棋盘那三格都在，累计用时也从 03:07 接着走 —— 恢复的是时间，不是提交态。 */
  it('restores a saved board and the accumulated time', () => {
    seedSave({
      board: {
        '0,0': { kind: 'participant', index: 1 },
        '1,1': { kind: 'numbers', entries: [2, 3] },
        '4,4': { kind: 'forbidden' },
      },
    });
    window.localStorage.setItem(gameTimerKey('night-train'), JSON.stringify({ gridSize: 9, participantCount: 3, elapsedMs: 187_000 }));
    render();
    // 计数器没了，直接看棋盘 —— 放置层出现、那一格 × 画出来了。
    expect(container.querySelector('main div[style*="z-index: 40"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="forbidden-4,4"]')).not.toBeNull();
    // 水合不能反过来把存档清掉：读到的还是那三格。
    const kept = JSON.parse(window.localStorage.getItem(gameProgressKey('night-train')) ?? '{}');
    expect(Object.keys(kept.board ?? {})).toHaveLength(3);
    expect(container.textContent).toContain('03:07');
    expect(container.querySelector('[title="已提交，可继续摆放后再次提交"]')).toBeNull();
  });

  /** 数据晚一拍才到时，计时 effect 的清理函数先以 `elapsedRef = 0` 落盘 —— 而 0 的语义是删键，会删掉刚要读的存档。 */
  it('数据晚一拍才到时，存档里的计时不会被抢在读取之前删掉', () => {
    window.localStorage.setItem(gameTimerKey('night-train'), JSON.stringify({ gridSize: 9, participantCount: 3, elapsedMs: 187_000 }));
    fixture.detailPending = true;
    render();
    // 数据到齐，同一个 root 再渲染一次 —— 这正是真浏览器里的那一拍。
    fixture.detailPending = false;
    render();

    expect(container.textContent).toContain('03:07');
    // 落盘写回的是那条存档，不是「0 毫秒 → 删键」。
    const stored = JSON.parse(window.localStorage.getItem(gameTimerKey('night-train')) ?? 'null') as { elapsedMs?: number } | null;
    expect(stored?.elapsedMs ?? 0).toBeGreaterThanOrEqual(187_000);
  });

  /** v0.11.10：表等这一页真的画好才走。 加载里（画布上那些图还没到）玩家还什么都没看见，那几秒不该记进成绩 —— 旧做法水合即起表，慢网下等于替等待记账。 */
  it('图还没到齐时表不走，画布就绪那一刻才从存档接着走', () => {
    vi.useFakeTimers();
    try {
      window.localStorage.setItem(gameTimerKey('night-train'), JSON.stringify({ gridSize: 9, participantCount: 3, elapsedMs: 60_000 }));
      preloadRef.ready = false;
      render();
      // 加载里先过去 10 秒 —— 这段不记账。
      act(() => vi.advanceTimersByTime(10_000));
      preloadRef.ready = true;
      render();
      expect(container.textContent).toContain('01:00');
      act(() => vi.advanceTimersByTime(2_000));
      expect(container.textContent).toContain('01:02');
    } finally {
      preloadRef.ready = true;
      vi.useRealTimers();
    }
  });

  /** 第二个口子：**换关**。 从定案卡点「下一关」时组件不重建，新一关的数据还在路上。若此时拿上一关的累计毫秒去写新一关的键（指纹 `gridSize: 0`）—— 成绩串了关，留下的还是一条永远读不回来的垃圾。所以换关时先关闸，等新一关读完自己的存档。 */
  it('换关时不把上一关的用时写进下一关的计时键', () => {
    window.localStorage.setItem(gameTimerKey('night-train'), JSON.stringify({ gridSize: 9, participantCount: 3, elapsedMs: 187_000 }));
    render();
    expect(container.textContent).toContain('03:07');

    // 切到另一关：先渲染「数据还没到」的那一拍（真实情况），再给数据。
    fixture.detail.slug = 'day-boat';
    fixture.detailPending = true;
    render();
    fixture.detailPending = false;
    fixture.detail.gridSize = 5;
    render();

    expect(window.localStorage.getItem(gameTimerKey('day-boat'))).toBeNull();
    // 上一关那条也还在、数字没被谁改写。
    const kept = JSON.parse(window.localStorage.getItem(gameTimerKey('night-train')) ?? 'null') as { elapsedMs?: number } | null;
    expect(kept?.elapsedMs ?? 0).toBeGreaterThanOrEqual(187_000);
  });

  /** 换关是同一 router 内换地址，组件不重建会继承上一关的缩放 / 平移等全部状态；渲染层按关卡套 `key` 卸载重建，这里钉「真的重建过」。 */
  it('换关时缩放 / 平移回到这一关自己的初值，不继承上一关', () => {
    window.localStorage.setItem(gameTimerKey('night-train'), JSON.stringify({ gridSize: 9, participantCount: 3, elapsedMs: 187_000 }));
    render();
    sizeCanvas();

    // 在 A 关放大两档 —— 这一页的缩放是逐关状态。
    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="放大"]')?.click());
    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="放大"]')?.click());
    expect(container.textContent).toContain('120%');

    // 换到 B 关（同一个 router，组件复用）。
    fixture.detail.slug = 'day-boat';
    fixture.detail.gridSize = 5;
    navigateTo('day-boat');

    // B 关拿回自己的 100%，不是 A 关留下的 120%。
    expect(container.textContent).not.toContain('120%');
    expect(container.textContent).toContain('100%');
  });

  /** 同一件事的另一面：**结案状态**也不该跟到下一关。 结算卡开着的时候点「下一关」，新一关若复用了 `result` / `checkRun`，那张「定案」卡会跟着过去。这里钉它不跟 —— 换关之后画面上没有结算卡。 */
  it('换关时上一关的结算卡与校验圈不跟过去', () => {
    vi.useFakeTimers();
    try {
      seedPassingBoard();
      render();
      submitAndSettle();
      expect(document.body.textContent).toContain('定案');
      // 通过之后棋盘上是**定案遮罩**（逐人校验的圈已经撤了）。
      expect(container.querySelector('[data-testid="verdict-scrim"]')).not.toBeNull();

      fixture.detail.slug = 'day-boat';
      fixture.detail.gridSize = 5;
      navigateTo('day-boat');

      // 新一关：没有结算卡，也没有上一关的定案遮罩 / 那几圈。
      expect(document.body.textContent).not.toContain('定案');
      expect(container.querySelector('[data-testid="verdict-scrim"]')).toBeNull();
      expect(container.querySelectorAll('main .press-ring-arc')).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  /** 提交后先逐人圈一遍：点下提交先压遮罩（左 / 右 / 中列 / 画布底色四处各一层），圈一拍一位加上去，圈完才撤圈、盖定案遮罩，再停一拍弹结算卡。 */
  it('提交后先逐人圈一遍，圈完才给结论', () => {
    vi.useFakeTimers();
    try {
      seedSave({
        board: {
          '0,0': { kind: 'participant', index: 1 },
          '1,1': { kind: 'participant', index: 2 },
          '2,2': { kind: 'participant', index: 3 },
        },
      });
      render();
      const rings = (): number =>
        container.querySelectorAll('main .press-ring-arc').length;
      const dialog = (): string => document.body.textContent ?? '';

      act(() => container.querySelector<HTMLButtonElement>('button[title="提交"]')?.click());
      // 四处遮罩同时出现、圈还没画、结论也还没出来。
      const scrims = container.querySelectorAll<HTMLElement>('[data-testid="check-scrim"]');
      expect(scrims).toHaveLength(4);
      for (const area of ['left', 'right', 'center', 'canvas']) {
        expect(container.querySelector(`[data-scrim-area="${area}"]`), area).not.toBeNull();
      }
      expect(rings()).toBe(0);
      expect(dialog()).not.toContain('定案');

      act(() => vi.advanceTimersByTime(GAME_CHECK_STEP_MS));
      expect(rings()).toBe(1);
      act(() => vi.advanceTimersByTime(GAME_CHECK_STEP_MS));
      expect(rings()).toBe(2);
      act(() => vi.advanceTimersByTime(GAME_CHECK_STEP_MS));
      expect(rings()).toBe(3);
      expect(dialog()).not.toContain('定案');

      // 最后再一拍才到结论阶段（v0.9.6：先撤圈、盖定案遮罩）。
      act(() => vi.advanceTimersByTime(GAME_CHECK_STEP_MS));
      /* 通过之后弹窗背后不留一圈圈结论 —— 用户要的是「把地图方格用遮罩遮住，上面展示定案 + 印章」。圈是过程（谁被圈成什么色），定案是结论； 两样同时在场会读成「还在校验」。 */
      expect(rings()).toBe(0);
      expect(container.querySelector('[data-testid="verdict-scrim"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="verdict-mark"]')?.textContent).toContain('定案');
      /* 结算卡要等定案遮罩停一拍才出现。注意这里查的是 **dialog 元素**而不是 `document.body.textContent` —— 遮罩上本来就写着「定案」两个字。 */
      expect(document.querySelector('[role="dialog"]')).toBeNull();

      act(() => vi.advanceTimersByTime(GAME_VERDICT_HOLD_MS));
      /* 结算卡的标题是主题里的一份配置（默认「解题成功」）， 所以这里只钉「卡出现了」，不钉某一句文案。 */
      expect(document.querySelector('[role="dialog"]')).not.toBeNull();
      // 结算卡一出现，四处校验遮罩一起撤掉 —— 不和弹窗自己的 overlay 叠成两层黑。
      expect(container.querySelectorAll('[data-testid="check-scrim"]')).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('未通过时报「结果 / 1/3 正确 / 未能结案」，不列错误人员与位置', () => {
    vi.useFakeTimers();
    try {
      seedSave({
        board: {
          '0,0': { kind: 'participant', index: 1 },
          '0,1': { kind: 'participant', index: 2 },
          '5,5': { kind: 'participant', index: 3 },
        },
      });
      render();
      act(() => container.querySelector<HTMLButtonElement>('button[title="提交"]')?.click());
      // v0.9.3 §2：结论在逐人校验之后 —— 三位三拍，再加一拍收尾。
      for (let i = 0; i < 4; i += 1) act(() => vi.advanceTimersByTime(GAME_CHECK_STEP_MS));
      // 通过时定案遮罩停一秒才弹窗（未通过不受影响）。
      act(() => vi.advanceTimersByTime(GAME_VERDICT_HOLD_MS));

      const dialog = document.body.textContent ?? '';
      expect(dialog).toContain('结果');
      expect(dialog).toContain('你没有找出所有人的位置！1/3 正确。未能结案。');
      // 名单整块删掉了：不点名、不说行列、也不说谁没放。
      expect(dialog).not.toContain('编号 1');
      expect(dialog).not.toContain('编号 2');
      expect(dialog).not.toContain('编号 3');
      expect(dialog).not.toContain('位置不对');
      expect(dialog).not.toContain('未放置');
      expect(dialog).not.toContain('提交未通过');
      expect(document.querySelector('[role="dialog"] ul')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  /** `x/n` 是算出来的，不是写死的一句。三人同列时三位都带 column issue —— 绿圈一个也没有，正文就得是 `0/3 正确`。 */
  it('未通过时的正确数随棋盘变化：三人同列是 0/3', () => {
    vi.useFakeTimers();
    try {
      seedSave({
        board: {
          '0,0': { kind: 'participant', index: 1 },
          '0,1': { kind: 'participant', index: 2 },
          '0,2': { kind: 'participant', index: 3 },
        },
      });
      render();
      act(() => container.querySelector<HTMLButtonElement>('button[title="提交"]')?.click());
      for (let i = 0; i < 4; i += 1) act(() => vi.advanceTimersByTime(GAME_CHECK_STEP_MS));
      // 通过时定案遮罩停一秒才弹窗（未通过不受影响）。
      act(() => vi.advanceTimersByTime(GAME_VERDICT_HOLD_MS));

      const dialog = document.body.textContent ?? '';
      expect(dialog).toContain('你没有找出所有人的位置！0/3 正确。未能结案。');
      expect(dialog).not.toContain('1/3');
    } finally {
      vi.useRealTimers();
    }
  });

  /** 没有全部放好之前，提交按钮是**禁用**的；编号（候选标记）不算放好 —— 它只是自己数格子时的草稿。 */
  it('keeps submit disabled until every participant has an avatar', () => {
    seedSave({
      board: {
        '0,0': { kind: 'numbers', entries: [1] },
        '1,1': { kind: 'numbers', entries: [2] },
        '2,2': { kind: 'numbers', entries: [3] },
      },
    });
    render();
    const blocked = container.querySelector<HTMLButtonElement>('button[title="尚未将人物放置完全"]');
    expect(blocked).not.toBeNull();
    expect(blocked?.disabled).toBe(true);

    // 同一份棋盘换成三个头像 —— 按钮点亮。
    act(() => root.unmount()); root = createRoot(container);
    seedSave({
      board: {
        '0,0': { kind: 'participant', index: 1 },
        '2,2': { kind: 'participant', index: 2 },
        '4,4': { kind: 'participant', index: 3 },
      },
    });
    render();
    const ready = container.querySelector<HTMLButtonElement>('button[title="提交"]');
    expect(ready).not.toBeNull();
    expect(ready?.disabled).toBe(false);
  });

  /** 提交未通过 →「继续游戏」，秒表接着走。 这里用假定时器把时间「推」过去，比真的等 2 秒稳，也能顺便确认停表那一刻数字确实冻住（而不是悄悄继续数）。 */
  it('resumes the clock when the player chooses 继续游戏', () => {
    vi.useFakeTimers();
    try {
      seedSave({
        board: {
          '0,0': { kind: 'participant', index: 1 },
          '0,1': { kind: 'participant', index: 2 },
          '5,5': { kind: 'participant', index: 3 },
        },
      });
      window.localStorage.setItem(gameTimerKey('night-train'), JSON.stringify({ gridSize: 9, participantCount: 3, elapsedMs: 3000 }));
      render();

      const clock = (): string | null =>
        container.querySelector('[data-testid="game-timer"]')?.textContent ?? null;
      expect(clock()).toBe('00:03');

      act(() => container.querySelector<HTMLButtonElement>('button[title="提交"]')?.click());
      expect(clock()).toBe('00:03');

      // 弹窗开着的时候钟是停的。
      // v0.9.3 §2：结论在逐人校验之后 —— 先把那几拍推完，弹窗才出现。
      for (let i = 0; i < 4; i += 1) act(() => vi.advanceTimersByTime(GAME_CHECK_STEP_MS));
      // 通过时定案遮罩停一秒才弹窗（未通过不受影响）。
      act(() => vi.advanceTimersByTime(GAME_VERDICT_HOLD_MS));
      expect(clock()).toBe('00:03');

      const resume = Array.from(document.querySelectorAll('button')).find(
        (node) => node.textContent?.trim() === '继续游戏',
      );
      expect(resume).not.toBeUndefined();
      act(() => resume?.click());

      act(() => vi.advanceTimersByTime(2000));
      expect(clock()).toBe('00:05');
    } finally {
      vi.useRealTimers();
    }
  });

  /** v0.6.3 §3.4: the deployed game renders the roster the puzzle was published with — the column count is frozen into the snapshot. */
  it('renders the roster in the columns the snapshot carries', () => {
    render();
    const matrix = container.querySelector('[data-testid="roster-matrix"]');
    const raw = matrix?.getAttribute('style') ?? '';
    expect(/repeat\(3,/.test(raw)).toBe(true);
  });

  it('starts empty when the save belongs to another grid', () => {
    seedSave({ gridSize: 12, board: { '0,0': { kind: 'participant', index: 1 } } });
    render();
    // 指纹不匹配的旧存档按「没有存档」处理：放置层整层不渲染（棋盘空白）。
    expect(container.querySelector('main div[style*="z-index: 40"]')).toBeNull();
  });

  it('writes the board back to localStorage while playing', () => {
    render();
    sizeCanvas();
    // 视口是测完才有尺寸的，自适应那一遍还没跑过；点一下「重置视图」把棋盘真正
    // 摆到视口中央，下面按视口中心点算出来的格子才稳定（不依赖默认格宽）。
    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="重置视图"]')?.click());

    const forbidden = container.querySelector<HTMLButtonElement>('button[title="标记"]');
    expect(forbidden).not.toBeNull();
    act(() => forbidden?.click());

    // 点在画布中央 —— 具体是第几格不重要，重要的是这一步落盘了。
    const main = container.querySelector('main');
    act(() => {
      main?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, clientX: 450, clientY: 350 }),
      );
    });

    const raw = window.localStorage.getItem(gameProgressKey('night-train'));
    expect(raw).not.toBeNull();
    const stored = JSON.parse(raw ?? '{}');
    expect(Object.values(stored.board ?? {})).toEqual([{ kind: 'forbidden' }]);
  });

  /** v0.7.14（docs/v0.7.14.md §4）：题面与结束语。 留下的这一半是**剧透**：没提交之前，结束语一个字都不该出现在页面里。 */
  /** v0.9.3 §5：配了圈图时，**只画那张被染成结果色的图**，不再另画一道本色弧。 棋盘里让 1、2 同排（未通过）、3 独自站对角线（通过），一次提交就能同时看到两档颜色。断言走 DOM：每位的 `<image filter>` 指向一条 `feColorMatrix`，矩阵值等于对应结果色的纯色矩阵；同时 `press-ring-arc` 只剩遮罩里那 3 条白色的（扇形刻度），没有结果色的进度弧 —— 颜色完全由已上传的图片承载。 */
  it('配了圈图：每位的结果色染到那张图上', () => {
    vi.useFakeTimers();
    try {
      // 圈图并进主题的 `ring`，校验只剩两档颜色。
      fixture.theme.ring = { image: { path: 'themes/3/check-ring/seal.webp' } };
      fixture.theme.checkStyle = { passColor: '#16A34A', failColor: '#DC2626' };
      seedSave({
        board: {
          '0,0': { kind: 'participant', index: 1 },
          '0,1': { kind: 'participant', index: 2 },
          '5,5': { kind: 'participant', index: 3 },
        },
      });
      render();
      act(() => container.querySelector<HTMLButtonElement>('button[title="提交"]')?.click());
      for (let i = 0; i < 4; i += 1) act(() => vi.advanceTimersByTime(GAME_CHECK_STEP_MS));
      // 通过时定案遮罩停一秒才弹窗（未通过不受影响）。
      act(() => vi.advanceTimersByTime(GAME_VERDICT_HOLD_MS));

      const images = Array.from(container.querySelectorAll('main image[filter]'));
      expect(images).toHaveLength(3);
      expect(images.every((image) => image.getAttribute('href') === '/api/files/themes/3/check-ring/seal.webp')).toBe(true);
      const matrices = images.map((image) => {
        const id = image.getAttribute('filter')?.replace(/^url\(#|\)$/g, '');
        const node = id ? container.querySelector(`filter#${id} feColorMatrix`) : null;
        return node?.getAttribute('values') ?? '';
      });
      expect(matrices.filter((value) => value === imageTintMatrix('#DC2626'))).toHaveLength(2);
      expect(matrices.filter((value) => value === imageTintMatrix('#16A34A'))).toHaveLength(1);

      // 有图就没有额外那道结果色弧：剩下的 3 条全是扇形遮罩里的白环。
      const arcs = Array.from(container.querySelectorAll('main circle.press-ring-arc'));
      expect(arcs).toHaveLength(3);
      expect(arcs.every((arc) => arc.getAttribute('stroke') === '#FFFFFF')).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('never shows the ending before the submit passes', () => {
    render();
    expect(document.body.textContent).not.toContain('灯灭了');
  });

  it('gives the author’s 结束语 in the 定案 card', () => {
    vi.useFakeTimers();
    try {
      // 三位各在一条互不相同的行与列上 —— 客户端校验通过。
      seedSave({
        board: {
          '0,0': { kind: 'participant', index: 1 },
          '1,1': { kind: 'participant', index: 2 },
          '2,2': { kind: 'participant', index: 3 },
        },
      });
      render();
      act(() => container.querySelector<HTMLButtonElement>('button[title="提交"]')?.click());
      for (let i = 0; i < 4; i += 1) act(() => vi.advanceTimersByTime(GAME_CHECK_STEP_MS));
      // 通过时定案遮罩停一秒才弹窗（未通过不受影响）。
      act(() => vi.advanceTimersByTime(GAME_VERDICT_HOLD_MS));

      const dialog = document.body.textContent ?? '';
      // v0.9.3 §3：标题是「定案」，不再说「提交通过」，也不再报用时。
      expect(dialog).toContain('定案');
      expect(dialog).not.toContain('提交通过');
      expect(dialog).not.toMatch(/用时\s*\d/);
      expect(dialog).toContain('灯灭了，花园还在。');
      // 结束语没有「结束语：」这样的标签 —— 它是作者的话，不是界面在解说。
      expect(dialog).not.toContain('结束语：');
    } finally {
      vi.useRealTimers();
    }
  });

  /** v0.9.3 §3：印章。只有**作者给提交按钮配了图**时才盖 —— 内置那枚 lucide 勾是界面图标，盖上去像把按钮按进纸里，不是一个印。 */
  it('作者给提交配了图，定案卡右上角才盖那一枚印', () => {
    vi.useFakeTimers();
    try {
      seedSave({
        board: {
          '0,0': { kind: 'participant', index: 1 },
          '1,1': { kind: 'participant', index: 2 },
          '2,2': { kind: 'participant', index: 3 },
        },
      });
      render();
      act(() => container.querySelector<HTMLButtonElement>('button[title="提交"]')?.click());
      for (let i = 0; i < 4; i += 1) act(() => vi.advanceTimersByTime(GAME_CHECK_STEP_MS));
      // 通过时定案遮罩停一秒才弹窗（未通过不受影响）。
      act(() => vi.advanceTimersByTime(GAME_VERDICT_HOLD_MS));
      // 没配 —— 只有字，没有印。
      expect(document.querySelector('[data-testid="verdict-stamp"]')).toBeNull();

      act(() => root.unmount()); root = createRoot(container);
      fixture.detail.puzzle.toolIcons = { submit: { path: 'puzzles/7/tool-icons/submit/a.webp' } };
      render();
      act(() => container.querySelector<HTMLButtonElement>('button[title="提交"]')?.click());
      for (let i = 0; i < 4; i += 1) act(() => vi.advanceTimersByTime(GAME_CHECK_STEP_MS));
      // 通过时定案遮罩停一秒才弹窗（未通过不受影响）。
      act(() => vi.advanceTimersByTime(GAME_VERDICT_HOLD_MS));

      const stamp = document.querySelector<HTMLImageElement>('[data-testid="verdict-stamp"]');
      expect(stamp).not.toBeNull();
      expect(stamp?.getAttribute('src')).toBe('/api/files/puzzles/7/tool-icons/submit/a.webp');
    } finally {
      fixture.detail.puzzle.toolIcons = null;
      vi.useRealTimers();
    }
  });

  /** 两张结果卡各有一枚「返回谜题列表」—— 一局结束，玩家的下一个动作通常不是再点棋盘，而是挑下一关。落点与左上角那个箭头同一个地址（`listHref`）。 落点带上这一关所属的主题 —— 返回的是**这个主题**的关卡列表， 不是全站那页（那边还要再挑一次主题）。 */
  describe('结果卡的出口（v0.9.5 / v0.11.6）', () => {
    it('通过：返回谜题列表 → 这个主题的列表页', () => {
      vi.useFakeTimers();
      try {
        seedPassingBoard();
        render();
        submitAndSettle();

        const back = footerButton('返回谜题列表');
        expect(back).toBeDefined();
        act(() => back?.click());
        expect(path()).toBe('/hlm/play');
      } finally {
        vi.useRealTimers();
      }
    });

    it('未通过：同样有一枚返回谜题列表', () => {
      vi.useFakeTimers();
      try {
        seedFailingBoard();
        render();
        submitAndSettle();

        // 继续游戏 / 重新开始仍在。
        expect(footerButton('继续游戏')).toBeDefined();
        expect(footerButton('重新开始')).toBeDefined();

        const back = footerButton('返回谜题列表');
        expect(back).toBeDefined();
        act(() => back?.click());
        expect(path()).toBe('/hlm/play');
      } finally {
        vi.useRealTimers();
      }
    });

    /** 「下一关」＝清单里排在当前之后、还没通过的第一关。当前是 `night-train` （清单第 0 条），后面那两关都没做过 → 跳 `day-boat`。 */
    it('通过：下一关跳到清单里第一个还没做的关', () => {
      vi.useFakeTimers();
      try {
        seedPassingBoard();
        render();
        submitAndSettle();

        const next = footerButton('下一关');
        expect(next).toBeDefined();
        act(() => next?.click());
        expect(path()).toBe('/play/day-boat');
      } finally {
        vi.useRealTimers();
      }
    });

    /** 后面那几关已经通过了 → 没有「下一关」可跳，那枚按钮就不画。 */
    it('通过：后面的关全通过了 → 不画「下一关」', () => {
      vi.useFakeTimers();
      try {
        // `night-train` 自己会在提交时写记录；另外两关先写进去。
        recordGameCompletion('day-boat', { gridSize: 5 }, { elapsedMs: 1000, stampUrl: null });
        recordGameCompletion('dusk-tower', { gridSize: 6 }, { elapsedMs: 2000, stampUrl: null });

        seedPassingBoard();
        render();
        submitAndSettle();

        expect(document.body.textContent).toContain('定案');
        expect(footerButton('返回谜题列表')).toBeDefined();
        expect(footerButton('下一关')).toBeUndefined();
      } finally {
        vi.useRealTimers();
      }
    });

    /** 未通过时不给「下一关」—— 通过之后它才是顺理成章的下一步。 */
    it('未通过：没有「下一关」', () => {
      vi.useFakeTimers();
      try {
        seedFailingBoard();
        render();
        submitAndSettle();

        expect(document.body.textContent).toContain('结果');
        expect(footerButton('下一关')).toBeUndefined();
      } finally {
        vi.useRealTimers();
      }
    });

    /** 后面没有没做过的关时，「再玩一次」重新当主按钮 —— 四枚全是描边的话， 结案卡上就读不出「下一步建议做什么」了。这里只看类名里的实心底色， 不钉具体 token。 */
    it('通过但没有下一关：再玩一次仍是主按钮', () => {
      vi.useFakeTimers();
      try {
        recordGameCompletion('day-boat', { gridSize: 5 }, { elapsedMs: 1000, stampUrl: null });
        recordGameCompletion('dusk-tower', { gridSize: 6 }, { elapsedMs: 2000, stampUrl: null });

        seedPassingBoard();
        render();
        submitAndSettle();

        expect(footerButton('下一关')).toBeUndefined();
        // `bg-primary` 是 Button 的 default 变体；outline 没有它。
        expect(footerButton('再玩一次')?.className).toContain('bg-primary');
      } finally {
        vi.useRealTimers();
      }
    });
  });

  /** 通过时落一条记录，列表页据此盖印并写出完成用时。 三条行为分开钉：写得对（用时 + 印地址）、没配印也能通过（`stampUrl` 为 null）、 未通过不写。 */
  describe('通过记录（v0.9.5）', () => {
    it('通过 → 记下用时与那枚印的地址', () => {
      vi.useFakeTimers();
      try {
        window.localStorage.setItem(gameTimerKey('night-train'), JSON.stringify({ gridSize: 9, participantCount: 3, elapsedMs: 187_000 }));
        fixture.detail.puzzle.toolIcons = { submit: { path: SUBMIT_STAMP_PATH } };
        seedPassingBoard();
        render();
        submitAndSettle();

        const saved = readGameCompletion('night-train', { gridSize: 9 });
        // 计时器从 03:07 接着走，提交那一刻停表 —— 精确到毫秒不确定，只钉区间。
        expect(saved?.elapsedMs).toBeGreaterThanOrEqual(187_000);
        expect(saved?.stampUrl).toBe(SUBMIT_STAMP_URL);
      } finally {
        fixture.detail.puzzle.toolIcons = null;
        vi.useRealTimers();
      }
    });

    it('没配印也能通过：记录在，印是 null', () => {
      vi.useFakeTimers();
      try {
        seedPassingBoard();
        render();
        submitAndSettle();

        const saved = readGameCompletion('night-train', { gridSize: 9 });
        expect(saved).not.toBeNull();
        expect(saved?.stampUrl).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it('未通过不写记录', () => {
      vi.useFakeTimers();
      try {
        seedFailingBoard();
        render();
        submitAndSettle();

        expect(readGameCompletion('night-train', { gridSize: 9 })).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it('zooms in and out by one step and resets to 100%', () => {
    render();
    sizeCanvas();
    expect(container.textContent).toContain('100%');

    const zoomIn = container.querySelector<HTMLButtonElement>('button[aria-label="放大"]');
    const zoomOut = container.querySelector<HTMLButtonElement>('button[aria-label="缩小"]');
    const reset = container.querySelector<HTMLButtonElement>('button[aria-label="重置视图"]');
    expect(zoomIn && zoomOut && reset).not.toBeNull();

    act(() => zoomIn?.click());
    expect(container.textContent).toContain('110%');

    act(() => zoomOut?.click());
    act(() => zoomOut?.click());
    expect(container.textContent).toContain('90%');

    act(() => reset?.click());
    expect(container.textContent).toContain('100%');
  });

  /** v0.8.6（docs/v0.8.6.md §4）：标记可以上传一张图。 只钉**画出来的是谁**：棋盘上那一格从 `×` 字形换成 `<img>`，地址由上传文件的相对路径拼出来；没配置时仍然是原来那个 `×`。尺寸、内缩、类名都是外观， 不在这里钉。 */
  describe('标记用上传的图片（v0.8.6）', () => {
    const symbolPath = 'puzzles/12/forbidden-symbol/red.webp';
    const symbolUrl = '/api/files/puzzles/12/forbidden-symbol/red.webp';

    it('谜题自己的图优先，其次主题，没配就落回 ×', () => {
      const cell = (): Element | null =>
        container.querySelector('[data-testid="forbidden-4,4"]');

      seedSave({ board: { '4,4': { kind: 'forbidden' } } });
      render();
      expect(cell()).not.toBeNull();
      expect(cell()?.tagName).toBe('text');
      expect(cell()?.textContent).toBe('×');

      // 旧版本行里连这个键都没有（不是 `null`，是 `undefined`）。
      delete (fixture.detail.puzzle as { mark?: unknown }).mark;
      act(() => root.unmount()); root = createRoot(container);
      render();
      expect(cell()?.tagName).toBe('text');

      // 谜题自己配了图。
      fixture.detail.puzzle.mark = { path: symbolPath };
      act(() => root.unmount()); root = createRoot(container);
      render();
      expect(cell()?.tagName).toBe('IMG');
      expect(cell()?.getAttribute('src')).toBe(symbolUrl);

      // 谜题没配 → 跟随主题。
      fixture.detail.puzzle.mark = null;
      fixture.theme.mark = { path: 'themes/3/forbidden-symbol/ink.webp' };
      act(() => root.unmount()); root = createRoot(container);
      render();
      expect(cell()?.tagName).toBe('IMG');
      expect(cell()?.getAttribute('src')).toBe('/api/files/themes/3/forbidden-symbol/ink.webp');

      // 两边都配了 → 谜题的赢。
      fixture.detail.puzzle.mark = { path: symbolPath };
      act(() => root.unmount()); root = createRoot(container);
      render();
      expect(cell()?.getAttribute('src')).toBe(symbolUrl);
    });

    it('previews the same image in the tool-hint layer', () => {
      fixture.detail.puzzle.mark = { path: symbolPath };
      render();
      sizeCanvas();
      // jsdom 没有真实布局：先按视口重排一次，再把指针放到画布中心。
      act(() => container.querySelector<HTMLButtonElement>('button[aria-label="重置视图"]')?.click());
      act(() => container.querySelector<HTMLButtonElement>('button[title="标记"]')?.click());
      act(() => {
        container.querySelector('main')?.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 450, clientY: 350 }));
      });

      const preview = Array.from(container.querySelectorAll('main img')).find((node) => node.getAttribute('src') === symbolUrl);
      expect(preview).not.toBeUndefined();
    });
  });

  /** v0.8.7 §7：「清除 / 撤回 / 提交」三枚按钮的画。页面级只认结果 —— 按钮里到底是一张 `<img>` 还是内置图标（`data-testid` 只在画图时出现）。 */
  describe('工具按钮图标（v0.8.7）', () => {
    beforeEach(() => {
      fixture.theme.toolIcons = null;
      fixture.detail.puzzle.toolIcons = null;
    });

    const iconSrc = (name: string): string | null | undefined =>
      container.querySelector(`[data-testid="${name}-tool-icon"]`)?.getAttribute('src');

    it('三枚都没配时画内置图标', () => {
      render();
      expect(iconSrc('clear')).toBeUndefined();
      expect(iconSrc('undo')).toBeUndefined();
      expect(iconSrc('submit')).toBeUndefined();
    });

    it('主题配了一套，三枚都跟着画', () => {
      fixture.theme.toolIcons = {
        clear: { path: 'themes/3/tool-icons/clear/a.webp' },
        undo: { path: 'themes/3/tool-icons/undo/b.webp' },
        submit: { path: 'themes/3/tool-icons/submit/c.webp' },
      };
      render();
      expect(iconSrc('clear')).toBe('/api/files/themes/3/tool-icons/clear/a.webp');
      expect(iconSrc('undo')).toBe('/api/files/themes/3/tool-icons/undo/b.webp');
      expect(iconSrc('submit')).toBe('/api/files/themes/3/tool-icons/submit/c.webp');
    });

    it('谜题自己配的那一枚覆盖主题，其余照旧跟随', () => {
      fixture.theme.toolIcons = { clear: { path: 'themes/3/tool-icons/clear/a.webp' } };
      fixture.detail.puzzle.toolIcons = { clear: { path: 'puzzles/7/tool-icons/clear/own.webp' } };
      render();
      expect(iconSrc('clear')).toBe('/api/files/puzzles/7/tool-icons/clear/own.webp');
    });

    /** v0.9.1 §3：清除工具的悬停预览必须与按钮**同一张图** —— 作者配了图，指针底下就不能还画内置橡皮。 */
    it('清除工具触碰方格时预览的是按钮那张图', () => {
      fixture.detail.puzzle.toolIcons = { clear: { path: 'puzzles/7/tool-icons/clear/own.webp' } };
      render();
      sizeCanvas();
      act(() => container.querySelector<HTMLButtonElement>('button[aria-label="重置视图"]')?.click());
      // 短按清除按钮 = 切换清除工具（按住 800ms 才是清空全部）。
      act(() => {
        const clear = container.querySelector<HTMLButtonElement>('button[title="清除放置，长按清空全部"]');
        clear?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
        clear?.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 }));
      });
      act(() => {
        container.querySelector('main')?.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 450, clientY: 350 }));
      });

      const preview = Array.from(container.querySelectorAll('main img')).find((node) => node.getAttribute('src') === '/api/files/puzzles/7/tool-icons/clear/own.webp');
      expect(preview).not.toBeUndefined();
    });
  });

  /** v0.9.1 §1：按钮不可用时给一句「为什么不能点」。 光标样式属于外观，不在断言里钉；这里只钉禁用态与原因提示。 */
  describe('禁用状态的提示（v0.9.1 §1）', () => {
    function expectDisabledHint(selector: string, text: string): void {
      const button = container.querySelector<HTMLButtonElement>(selector);
      expect(button, selector).not.toBeNull();
      expect(button?.disabled, selector).toBe(true);
      expect(button?.parentElement?.getAttribute('title'), selector).toBe(text);
    }

    it('回退与提交：不可用时各给一句原因', () => {
      render();
      expectDisabledHint('button[title="当前没有可以回退的步骤"]', '当前没有可以回退的步骤');
      expectDisabledHint('button[title="尚未将人物放置完全"]', '尚未将人物放置完全');
    });
  });

  /** **计时的规范** + 结案遮罩。 用户给的规则：；首次进入从 00:00 计时；离开记录时间 a；再进从 a 继续；；提交暂停 b；通过记为完成时间 c，之后都是 00:00 开始；；未通过点「继续游戏」从 b 继续；「重新开始」从 00:00；；**已完成再次进入 → 定格 00:00，点「再玩一次」才开跑**。 */
  describe('计时与结案遮罩（v0.9.6）', () => {
    it('已完成再次进入：定格 00:00、盖定案遮罩、多一颗「再玩一次」', () => {
      recordGameCompletion('night-train', { gridSize: 9 }, { elapsedMs: 90_000, stampUrl: null });
      window.localStorage.setItem(gameTimerKey('night-train'), JSON.stringify({ gridSize: 9, participantCount: 3, elapsedMs: 45_000 }));

      render();

      // 表停在 00:00（不是存档里的 00:45，也不是完成时的 01:30）。
      expect(container.textContent).toContain('00:00');
      expect(container.textContent).not.toContain('00:45');

      const scrim = container.querySelector('[data-testid="verdict-scrim"]');
      expect(scrim).not.toBeNull();
      expect(scrim?.textContent).toContain('定案');
      expect(scrim?.querySelector('[data-testid="verdict-replay"]')).not.toBeNull();
      /* 地图遮罩用「一般遮罩颜色」—— 与四处校验遮罩、弹窗 overlay 同一个 token （DIALOG_OVERLAY_TINT_CLASS）。 */
      expect(scrim?.className).toContain(DIALOG_OVERLAY_TINT_CLASS);
    });

    /** **结案后整块画布与名册不接指针**（地图 / 物品 / 人物交互全停）。 断言的是行为 —— 往画布派发点击，棋盘存档一个字都不变；视图簇按钮禁用； 「再玩一次」仍能点。 */
    it('定案后：画布与名册不接指针，视图簇禁用，再玩一次仍可用', () => {
      recordGameCompletion('night-train', { gridSize: 9 }, { elapsedMs: 90_000, stampUrl: null });
      render();

      const main = container.querySelector('main');
      const before = window.localStorage.getItem(gameProgressKey('night-train'));
      act(() => {
        main?.dispatchEvent(
          new MouseEvent('click', { bubbles: true, clientX: 450, clientY: 350 }),
        );
        main?.dispatchEvent(
          new MouseEvent('pointermove', { bubbles: true, clientX: 450, clientY: 350 }),
        );
      });
      expect(window.localStorage.getItem(gameProgressKey('night-train'))).toBe(before);

      // 右栏视图簇：放大 / 缩小 / 重置视图 / 标尺四枚都禁用。
      for (const label of ['放大', '缩小', '重置视图', '显示 / 隐藏标尺']) {
        const button = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
          (candidate) => candidate.getAttribute('aria-label') === label || candidate.title === label,
        );
        expect(button?.disabled, label).toBe(true);
      }

      // 遮罩里的「再玩一次」仍然能点，点完遮罩撤掉。
      const replay = container.querySelector<HTMLButtonElement>('[data-testid="verdict-replay"]');
      expect(replay?.disabled).toBe(false);
      act(() => replay?.click());
      expect(container.querySelector('[data-testid="verdict-scrim"]')).toBeNull();
    });

    /** 例外：结案后**返回与切换日夜模式仍可用**。 左栏整体 `pointer-events-none`，头部那一行用 `pointer-events-auto` 恢复。 jsdom 不做 CSS hit-testing，所以这里钉的是「按钮没有被 disabled」这一半； `pointer-events` 的实际放行在真浏览器里验（读 `getComputedStyle` 与点击）。 */
    it('定案后：返回按钮与主题开关仍未被禁用', () => {
      recordGameCompletion('night-train', { gridSize: 9 }, { elapsedMs: 90_000, stampUrl: null });
      render();

      const back = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
        (candidate) =>
          candidate.getAttribute('aria-label') === '返回游戏列表' ||
          candidate.title === '返回游戏列表',
      );
      const theme = container.querySelector<HTMLButtonElement>('[data-testid="theme-toggle"]');

      expect(back?.disabled).toBe(false);
      expect(theme?.disabled).toBe(false);
      // 主题按钮真的挂了 cycle：点一下 mode 会变（三态循环）。
      const before = theme?.getAttribute('data-theme-mode');
      act(() => theme?.click());
      expect(container.querySelector('[data-testid="theme-toggle"]')?.getAttribute('data-theme-mode')).not.toBe(before);
    });

    /** **隔着遮罩冒泡的指针不点亮 hover**。 遮罩自己 `pointer-events-auto` 接住指针之后，事件会沿 React 树冒泡到 `<main>` 的 `onPointerMove`。之前只靠 CSS `pointer-events-none` 挡住 hit-testing，没挡住冒泡，于是光标框 / 物品抬起 / 区域高亮会隔着遮罩亮起来。 现在 handler 入口短路 + `hoverEffects` 从源头收 `hover: null`。 */
    it('定案后：从遮罩冒泡的 pointermove 不点亮任何格子 hover', () => {
      recordGameCompletion('night-train', { gridSize: 9 }, { elapsedMs: 90_000, stampUrl: null });
      render();

      const scrim = container.querySelector<HTMLElement>('[data-testid="verdict-scrim"]');
      expect(scrim).not.toBeNull();
      act(() => {
        scrim?.dispatchEvent(
          new MouseEvent('pointermove', { bubbles: true, clientX: 450, clientY: 350 }),
        );
        scrim?.dispatchEvent(
          new MouseEvent('pointerover', { bubbles: true, clientX: 450, clientY: 350 }),
        );
      });

      // 光标不该变成 pointer（hoverEffects.cell 恒为 null），物品名提示不出现。
      const main = container.querySelector<HTMLElement>('main');
      expect(main?.style.cursor).not.toBe('pointer');
      expect(container.querySelector('[data-testid="item-name-tip"]')).toBeNull();
      // 棋盘存档也没被落笔。
      const before = window.localStorage.getItem(gameProgressKey('night-train'));
      act(() => {
        scrim?.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 450, clientY: 350 }));
      });
      expect(window.localStorage.getItem(gameProgressKey('night-train'))).toBe(before);
    });

    it('点「再玩一次」：遮罩撤掉、表从 00:00 开始跑', () => {
      recordGameCompletion('night-train', { gridSize: 9 }, { elapsedMs: 90_000, stampUrl: null });
      render();
      expect(container.querySelector('[data-testid="verdict-scrim"]')).not.toBeNull();

      act(() =>
        container.querySelector<HTMLButtonElement>('[data-testid="verdict-replay"]')?.click(),
      );

      expect(container.querySelector('[data-testid="verdict-scrim"]')).toBeNull();
      expect(container.textContent).toContain('00:00');
    });

    it('没完成过的关卡：不盖定案遮罩、也没有「再玩一次」', () => {
      render();
      expect(container.querySelector('[data-testid="verdict-scrim"]')).toBeNull();
    });

    it('通过之后右侧四枚动作按钮全部置灰', () => {
      vi.useFakeTimers();
      try {
        seedPassingBoard();
        render();
        submitAndSettle();

        // 四枚工具按钮（标记 / 清除 / 回退 / 提交）都 disabled。
        for (const title of ['标记', '清除放置，长按清空全部']) {
          expect(container.querySelector<HTMLButtonElement>(`button[title="${title}"]`)?.disabled).toBe(true);
        }
        const undo = container.querySelector<HTMLButtonElement>('button[title*="已结案"]');
        expect(undo?.disabled).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it('通过之后结算卡里不再有印章 —— 印搬到遮罩上了', () => {
      vi.useFakeTimers();
      try {
        seedPassingBoard();
        fixture.detail.puzzle.toolIcons = { submit: { path: 'puzzles/7/tool-icons/submit/a.webp' } };
        render();
        submitAndSettle();

        const dialog = document.querySelector('[role="dialog"]');
        // 标题文案由主题配置（默认「解题成功」），这里只确认卡开了。
        expect(dialog?.querySelector('[data-testid="verdict-title"]')).not.toBeNull();
        expect(dialog?.querySelector('[data-testid="verdict-stamp"]')).toBeNull();
        // 印在遮罩上，图片就是配置的那张。
        const scrim = container.querySelector('[data-testid="verdict-scrim"]');
        const stamp = scrim?.querySelector<HTMLImageElement>('[data-testid="verdict-stamp"]');
        expect(stamp?.getAttribute('src')).toBe('/api/files/puzzles/7/tool-icons/submit/a.webp');
        // 结算卡开着时，遮罩上不重复放「再玩一次」（卡里已有）。
        expect(scrim?.querySelector('[data-testid="verdict-replay"]')).toBeNull();
      } finally {
        fixture.detail.puzzle.toolIcons = null;
        vi.useRealTimers();
      }
    });

    /** **「再玩一次」一开始就不渲染**。 用户：「从一开始就不要渲染，后面再渲染出来」。判据曾经是 `!result` —— 通过之后那 1 秒（定案遮罩在场、结算卡还没落）它会先画出来，卡一弹再撤掉，关上又补回来。这里钉住中间那一刻：遮罩在、按钮不在。 */
    it('定案遮罩单独在场的那一秒：还没有「再玩一次」', () => {
      vi.useFakeTimers();
      try {
        seedPassingBoard();
        render();
        act(() => container.querySelector<HTMLButtonElement>('button[title="提交"]')?.click());
        for (let i = 0; i < 4; i += 1) act(() => vi.advanceTimersByTime(GAME_CHECK_STEP_MS));

        const scrim = container.querySelector('[data-testid="verdict-scrim"]');
        expect(scrim).not.toBeNull();
        expect(document.querySelector('[role="dialog"]')).toBeNull();
        expect(scrim?.querySelector('[data-testid="verdict-replay"]')).toBeNull();

        // 结算卡落下来时依然没有；关上之后才补出来（见下一条用例）。
        act(() => vi.advanceTimersByTime(GAME_VERDICT_HOLD_MS));
        expect(scrim?.querySelector('[data-testid="verdict-replay"]')).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    /** **结算卡开着时遮罩上不画「再玩一次」，关掉之后补出来**。 用户：「游戏校验通过后展示定案和印章时，不展示再玩一次按钮」，紧接着补一句「改为关闭弹窗后显示」，再补一句「从一开始就不要渲染，后面再渲染出来」。所以这一局头一秒不画、卡开着时不画，`closeResult` 关掉卡之后才补。 */
    it('关掉通过的结算卡：遮罩仍在，并补出「再玩一次」', () => {
      vi.useFakeTimers();
      try {
        seedPassingBoard();
        render();
        submitAndSettle();
        expect(document.querySelector('[role="dialog"]')).not.toBeNull();

        const close = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')).find((button) => button.textContent?.trim() === '关闭');
        act(() => close?.click());

        const scrim = container.querySelector('[data-testid="verdict-scrim"]');
        expect(scrim).not.toBeNull();
        expect(scrim?.querySelector('[data-testid="verdict-replay"]')).not.toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    /** v0.11.3（docs/v0.11.3.md §6）—— 结算卡那一行的图标与标题**是主题里配的**。 判据三件事：没配时落回内置的 🎉 +「解题成功」（老主题原样可用）、配了文字就换成文字、配了图就只画图不再写文字。第三件是这条的要点 —— 两个都画会把标题挤开，用户要的是「上传图片会覆盖文字」。 */
    describe('结算卡的图标与标题由主题给（v0.11.3）', () => {
      function verdictScope(): Element | null {
        return document.querySelector('[role="dialog"]');
      }

      it('主题没配落回内置，配文字 / 配图就换成主题的', () => {
        vi.useFakeTimers();
        try {
          seedPassingBoard();
          render();
          submitAndSettle();
          let dialog = verdictScope();
          expect(dialog?.querySelector('[data-testid="verdict-icon"]')?.textContent).toBe('🎉');
          expect(dialog?.querySelector('[data-testid="verdict-title"]')?.textContent).toBe('解题成功');

          // 换一份主题再开一局：先清掉上一局的完成记录，否则一进来就是「已结案」。
          act(() => root.unmount()); root = createRoot(container);
          window.localStorage.clear();
          fixture.theme.verdict = { iconText: '🏮', title: '此案已了' };
          seedPassingBoard();
          render();
          submitAndSettle();
          dialog = verdictScope();
          expect(dialog?.querySelector('[data-testid="verdict-icon"]')?.textContent).toBe('🏮');
          expect(dialog?.querySelector('[data-testid="verdict-title"]')?.textContent).toBe('此案已了');

          act(() => root.unmount()); root = createRoot(container);
          window.localStorage.clear();
          fixture.theme.verdict = {
            iconText: '🏮',
            icon: { path: 'themes/2/verdict/b.webp' },
            title: '此案已了',
          };
          seedPassingBoard();
          render();
          submitAndSettle();
          dialog = verdictScope();
          const icon = dialog?.querySelector('[data-testid="verdict-icon"]');
          expect(icon?.tagName).toBe('IMG');
          expect(icon?.getAttribute('src')).toBe('/api/files/themes/2/verdict/b.webp');
          expect(dialog?.textContent).not.toContain('🏮');
          expect(dialog?.querySelector('[data-testid="verdict-title"]')?.textContent).toBe('此案已了');
        } finally {
          vi.useRealTimers();
        }
      });
    });
  });

  /** 竖屏：描述挂在头部一枚图标后面的弹框里，不在题面里。 判据是「描述这段文字出现在哪儿」—— 面板里没有、弹框里有；线索仍在面板里（线索是解题时要反复对照的，不该跟着描述一起挪走）。 */
  describe('竖屏：描述改由头部图标弹出（v0.10.1）', () => {
    const VIEWPORT_WIDTH = window.innerWidth;
    const VIEWPORT_HEIGHT = window.innerHeight;

    /** 让 `fit` 里的 `isPortraitViewport` 判成竖屏；jsdom 默认 1024×768。 */
    function pretendPortrait(): void {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 812 });
    }

    afterEach(() => {
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: VIEWPORT_WIDTH,
      });
      Object.defineProperty(window, 'innerHeight', {
        configurable: true,
        value: VIEWPORT_HEIGHT,
      });
    });

    /** 量一次容器再点「重置视图」—— `fit` 才会拿真实矩形跑一遍、定下竖屏形态。 */
    function settlePortrait(): void {
      sizeCanvas();
      act(() => container.querySelector<HTMLButtonElement>('button[aria-label="重置视图"]')?.click());
    }

    const descriptionOpener = (): HTMLButtonElement | undefined =>
      Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
        (candidate) => candidate.getAttribute('aria-label') === '谜题描述',
      );

    it('面板里没有描述，线索还在', () => {
      pretendPortrait();
      render();
      settlePortrait();

      expect(container.querySelector('[data-testid="game-brief-description"]')).toBeNull();
      expect(container.querySelectorAll('[data-testid="game-brief-clue"]')).toHaveLength(2);
      expect(container.textContent).not.toContain('三人三行，各归其位。');
    });

    it('点头部那枚图标，描述在弹框里', () => {
      pretendPortrait();
      render();
      settlePortrait();

      const opener = descriptionOpener();
      expect(opener).not.toBeUndefined();

      act(() => opener?.click());

      const dialog = document.querySelector('[role="dialog"]');
      expect(dialog?.textContent).toContain('三人三行，各归其位。');
    });

    /** 竖屏里那个弹框不显示「谜题描述」这一行标题 —— 玩家刚点的就是那枚图标，标题只是把同一件事又说一遍，还占掉一行高度。 但**读屏仍要知道这个弹框叫什么**，所以标题元素留着、只是不可见。这里钉的是那条无障碍约定：删掉标题会让 Radix 报警，读屏也只会念出一段没有名字的文本。 */
    it('弹框的标题不再占位，但读屏仍拿得到名字', () => {
      pretendPortrait();
      render();
      settlePortrait();

      act(() => descriptionOpener()?.click());

      const dialog = document.querySelector('[role="dialog"]');
      const labelledBy = dialog?.getAttribute('aria-labelledby');
      expect(labelledBy).toBeTruthy();
      expect(document.getElementById(labelledBy ?? '')?.textContent).toBe('谜题描述');
    });

    it('没有描述时不挂那枚图标', () => {
      fixture.detail.puzzle.description = '';
      try {
        pretendPortrait();
        render();
        settlePortrait();

        expect(descriptionOpener()).toBeUndefined();
      } finally {
        fixture.detail.puzzle.description = '三人三行，各归其位。';
      }
    });

    it('桌面端：描述仍在面板里，也没有那枚图标', () => {
      render();
      settlePortrait();

      expect(container.querySelector('[data-testid="game-brief-description"]')).not.toBeNull();
      expect(descriptionOpener()).toBeUndefined();
    });

    /** 竖屏下左栏是 `display: contents`（没有盒子），那层 `absolute` 的 left 遮罩被 `max-md:hidden` 收掉；题面 / 名册又落在一个 `overflow-y-auto` 的滚动容器里，给它们挂 `absolute inset-0` 会随内容滚走。所以竖屏用一层 `fixed inset-0` 的整屏遮罩，挂在最外层、相对视口，校验期间一次盖住头部 / 题面 / 名册 / 工具栏。 */
    it('竖屏提交校验时，整屏遮罩盖住题面与名册，结算后撤掉', () => {
      vi.useFakeTimers();
      try {
        pretendPortrait();
        seedSave({
          board: {
            '0,0': { kind: 'participant', index: 1 },
            '1,1': { kind: 'participant', index: 2 },
            '2,2': { kind: 'participant', index: 3 },
          },
        });
        render();
        settlePortrait();

        act(() =>
          container.querySelector<HTMLButtonElement>('button[title="提交"]')?.click(),
        );

        const portrait = container.querySelector<HTMLElement>('[data-scrim-area="portrait"]');
        expect(portrait).not.toBeNull();
        expect(portrait?.className).toContain('fixed inset-0');
        expect(portrait?.className).toContain(DIALOG_OVERLAY_TINT_CLASS);
        expect(Number(portrait?.style.zIndex)).toBe(UI_Z.saveMask);
        // 竖屏里 center / right 两层同档遮罩要撤掉，否则整屏那层会叠成两层黑。
        expect(container.querySelector<HTMLElement>('[data-scrim-area="center"]')?.className).toContain('portrait:max-md:hidden');
        expect(container.querySelector<HTMLElement>('[data-scrim-area="right"]')?.className).toContain('portrait:max-md:hidden');

        // 结算卡出现后遮罩一起撤掉，不能和弹窗自己的 overlay 叠成两层黑。
        for (let i = 0; i < 4; i += 1) act(() => vi.advanceTimersByTime(GAME_CHECK_STEP_MS));
        act(() => vi.advanceTimersByTime(GAME_VERDICT_HOLD_MS));
        expect(container.querySelector('[data-scrim-area="portrait"]')).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  /** Loading 等「当前页资源全部加载完」才撤。 */
  describe('v0.11.2 loading 等页面资源', () => {
    beforeEach(() => {
      assetsRef.isLoading = false;
      assetsRef.data = [];
      fixture.detailPending = false;
      fixture.detail.map.cells = {};
      preloadRef.ready = true;
      preloadRef.urls = [];
    });

    afterEach(() => {
      assetsRef.isLoading = false;
      assetsRef.data = [];
      fixture.detail.map.cells = {};
      fixture.detailPending = false;
      preloadRef.ready = true;
    });

    const hasBoard = (): boolean => container.querySelector('main') !== null;

    it('loading 等 detail、资源表、预加载都到齐才撤', () => {
      fixture.detailPending = true;
      render();
      expect(hasBoard()).toBe(false);
      fixture.detailPending = false;
      render();
      expect(hasBoard()).toBe(true);

      assetsRef.isLoading = true;
      render();
      expect(hasBoard()).toBe(false);
      assetsRef.isLoading = false;
      render();
      expect(hasBoard()).toBe(true);

      preloadRef.ready = false;
      render();
      expect(hasBoard()).toBe(false);
      preloadRef.ready = true;
      render();
      expect(hasBoard()).toBe(true);
    });

    it('画布上要画的图都交给预加载去等', () => {
      fixture.theme.ring = {
        image: { path: 'themes/1/check-ring/seal.webp' },
      } as (typeof fixture.theme)['ring'];
      render();

      expect(preloadRef.urls).toContain('/api/files/themes/1/check-ring/seal.webp');
    });

    /** 用户口径是「**当前页面用到的**全部资源」，不是整张资源表。 资源表里躺着这一关没用到的几百张图时，等它们等于白等 —— 玩家盯着 loading，等的却是别关的素材。 */
    it('只等这一关用到的资源，没用到的图案不拖住 loading', () => {
      assetsRef.data = [
        asset(2, '画上的船', '/uploads/used.webp'),
        asset(3, '别关的树', '/uploads/unused.webp'),
      ];
      fixture.detail.map.cells = { '0,0': { item: { assetId: 2, w: 1, h: 1 } } };
      render();

      expect(preloadRef.urls).toContain('/uploads/used.webp');
      expect(preloadRef.urls).not.toContain('/uploads/unused.webp');
    });
  });

  /**
   * loading 期间 `<main>` 不渲染，视口 effect 跑在 `containerRef.current === null` 那一拍，`fit()` 与 `ResizeObserver` 都没落地，棋盘就卡在左上角。
   */
  describe('v0.11.2 loading 结束后的视口自适应', () => {
    let observed: Element[] = [];
    let callbacks: ResizeObserverCallback[] = [];

    beforeEach(() => {
      observed = [];
      callbacks = [];
      assetsRef.isLoading = false;
      assetsRef.data = [];
      fixture.detailPending = false;
      preloadRef.ready = true;
      // 记下「观察了谁」「回调是什么」，好在拿到真实尺寸后手动触发一次重排。
      vi.stubGlobal(
        'ResizeObserver',
        class {
          private readonly callback: ResizeObserverCallback;
          constructor(callback: ResizeObserverCallback) {
            this.callback = callback;
            callbacks.push(callback);
          }
          observe(target: Element): void {
            observed.push(target);
          }
          unobserve(): void {}
          disconnect(): void {}
        },
      );
    });

    afterEach(() => {
      assetsRef.isLoading = false;
      fixture.detailPending = false;
      preloadRef.ready = true;
    });

    /** 画布纸（`total × total` 那张，带平移缩放）。 */
    function canvas(): HTMLElement | null {
      return container.querySelector<HTMLElement>('[data-testid="game-canvas"]');
    }

    it('loading 期间没有画布，也就没东西可量', () => {
      fixture.detailPending = true;
      render();

      expect(container.querySelector('main')).toBeNull();
      expect(observed).toHaveLength(0);
    });

    it('loading 撤掉后观察者挂到了真实的 <main> 上', () => {
      fixture.detailPending = true;
      render();
      expect(observed).toHaveLength(0);

      fixture.detailPending = false;
      render();

      const main = container.querySelector('main');
      expect(main).not.toBeNull();
      expect(observed).toContain(main);
    });

    it('拿到尺寸后按可用区铺满并居中，不留在左上角', () => {
      /* 顺序才是关键：gridSize 变化那一拍画布还没出现，画布出现时 gridSize 没变 —— 只依赖 gridSize 的实现会永远空转。 */
      assetsRef.isLoading = true;
      fixture.detailPending = true;
      render();
      expect(container.querySelector('main')).toBeNull();

      // ② JSON 到、资源表没到：gridSize 变了，但画布还没资格出现。
      fixture.detailPending = false;
      render();
      expect(container.querySelector('main')).toBeNull();

      // ③ 资源表到：画布出现，gridSize 没有变化。
      assetsRef.isLoading = false;
      render();
      // 真浏览器里元素一进文档就有尺寸；这里补上，再像 ResizeObserver 那样通知一次。
      sizeCanvas();
      act(() => {
        for (const callback of callbacks) {
          callback([], {} as ResizeObserver);
        }
      });

      const paper = canvas();
      expect(paper).not.toBeNull();
      const width = Number.parseFloat(paper?.style.width ?? '0');
      // 自适应算出来的格子不可能还是「没量过」的那个初值。
      expect(width).not.toBe(fixture.detail.gridSize * DEFAULT_CELL_SIZE);
      expect(width).toBeGreaterThan(fixture.detail.gridSize * DEFAULT_CELL_SIZE);
      // 居中意味着有偏移；`0, 0` 正是「贴在左上角」的形态。
      expect(paper?.style.transform).not.toContain('translate(0px, 0px)');
    });
  });

  /** **空手时点格子也要有效果** —— 没选参与者、也没选工具，指针划过去或按下去， 同样要有光标框、物品抬起与名字 tip，玩家不必先点一个工具才知道这一格是什么。 触屏点一下不会先给 `pointermove`，全靠 `onPointerDown` 在按下那一拍把悬停状态写上；后一条用例钉的就是这条通道（只派发 `pointerdown`、不派发 `pointermove`）。 */
  describe('v0.11.2 空手时格子照常有悬停反馈', () => {
    beforeEach(() => {
      assetsRef.data = [asset(2, '画上的船', '/uploads/boat.webp')];
      // 9×9 的正中那格放一件带图的物品，指针放到画布中心就能扫到它。
      fixture.detail.map.cells = { '4,4': { item: { assetId: 2, w: 1, h: 1 } } };
    });

    afterEach(() => {
      assetsRef.data = [];
      fixture.detail.map.cells = {};
    });

    function hoverCenter(): void {
      act(() => {
        container.querySelector('main')?.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 450, clientY: 350 }));
      });
    }

    function pressCenter(): void {
      act(() => {
        container.querySelector('main')?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 450, clientY: 350 }));
      });
    }

    function openBoard(): HTMLElement {
      render();
      sizeCanvas();
      // jsdom 没有真实布局：先按视口重排一次，指针坐标才落得到格子上。
      act(() => container.querySelector<HTMLButtonElement>('button[aria-label="重置视图"]')?.click());
      const main = container.querySelector<HTMLElement>('main');
      if (!main) throw new Error('画布容器没渲染出来');
      return main;
    }

    const boatImage = (): HTMLElement | null | undefined =>
      Array.from(container.querySelectorAll<HTMLElement>('main img')).find(
        (node) => node.getAttribute('src') === '/uploads/boat.webp',
      );

    function expectFeedback(main: HTMLElement): void {
      expect(main.style.cursor).toBe('pointer');
      expect(container.querySelector('[data-testid="item-name-tip"]')).not.toBeNull();
      expect(boatImage()?.style.transform ?? '').toContain(`translateY(-${ITEM_HOVER_LIFT_PX}px)`);
    }

    it('没选工具时扫过带物品的格子：光标框、物品抬起、名字 tip 都在', () => {
      vi.useFakeTimers();
      try {
        const main = openBoard();
        hoverCenter();
        // tip 有一段延迟，等过它才说明它真的会来。
        act(() => vi.advanceTimersByTime(ITEM_NAME_TIP_DELAY_MS));
        expectFeedback(main);
      } finally {
        vi.useRealTimers();
      }
    });

    it('触屏只有按下、没有悬停：按下去那一刻同样出全部反馈', () => {
      vi.useFakeTimers();
      try {
        const main = openBoard();
        pressCenter();
        act(() => vi.advanceTimersByTime(ITEM_NAME_TIP_DELAY_MS));
        expectFeedback(main);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  /** 玩法说明。 只钉玩家看得见的两件事：进关卡不自己弹（要看自己点），两枚问号随时能打开。 */
  describe('v0.11.7 玩法说明', () => {
    function helpDialog(): HTMLElement | null {
      // Radix 把弹框内容 portal 到 `document.body`，不在 `container` 里。
      return document.querySelector<HTMLElement>('[data-testid="game-help-dialog"]');
    }

    function helpButtons(): HTMLButtonElement[] {
      return Array.from(
        container.querySelectorAll<HTMLButtonElement>('button[aria-label="玩法说明"]'),
      );
    }

    it('进关卡不自己弹', () => {
      render();
      expect(helpDialog()).toBeNull();
    });

    it('点问号能打开（桌面右栏与竖屏头部各一枚）', () => {
      render();
      expect(helpDialog()).toBeNull();

      const buttons = helpButtons();
      // 两枚都在 DOM 里，只是断点不同：桌面那枚沉在右栏最下面，竖屏那枚在头部。
      expect(buttons).toHaveLength(2);
      for (const button of buttons) {
        act(() => button.click());
        expect(helpDialog()).not.toBeNull();
        act(() => footerButton('知道了')?.click());
        expect(helpDialog()).toBeNull();
      }
    });

  });

});
