import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { GAME_CHECK_STEP_MS, UI_Z } from '@loredoku/shared';
import { DIALOG_OVERLAY_TINT_CLASS } from '@/components/ui/dialog';
import type { UploadedImage, GameToolIcons, ThemeCheckColors, ThemeRing } from '@loredoku/shared';
import { installMatchMedia, type MatchMediaStub } from '@/testing/matchMedia';
import { imageTintMatrix } from '@/components/common/PressRing';
import { GAME_PROGRESS_VERSION, gameProgressKey } from '@/lib/gameProgress';
import { readGameCompletion, recordGameCompletion } from '@/lib/gameCompletion';
import { gameTimerKey } from '@/lib/gameTimer';
import ApiGamePage from './ApiGamePage';

/**
 * v0.6.2（docs/v0.6.2.md §3 / §4）开出的页面级测试，v0.7.11 按新行为重写：
 *
 * 1. 进页面时把本地存档恢复成棋盘 —— **不再**有「已提交」这个可恢复的状态，
 *    取而代之的是**计时**：关掉页面再回来，秒表接着走；
 * 2. 右栏的缩放簇真的能改比例，重置能回到 100%；
 * 3. 提交是一次结算：未通过时弹窗报结论与 `x/n 正确`，不再列谁不对。
 *
 * 页面级只钉**对外可观察**的结果（用时 / 百分比 / 弹窗文案 / 棋盘画了什么），
 * 存档与计时的清洗规则分别在 `gameProgress.test.ts` / `gameTimer.test.ts` 里覆盖。
 *
 * v0.9.0 §17：右下角「已放置 / 可回退」两行统计被删掉，原先靠这两行断言存档
 * 水合的用例改成看**棋盘本身**（放置层与 `forbidden-*` 标记）—— 少一层文案，
 * 断言反而更贴近玩家真正看见的东西。
 */

const fixture = vi.hoisted(() => ({
  /**
   * v0.9.5：这一关的数据还在路上（真浏览器里的第一拍）。用例用完记得放回 `false`。
   */
  detailPending: false,
  /**
   * v0.9.5：整份关卡清单（`/api/games` 那一份，按作者排好的先后）。定案卡的
   * 「下一关」从它算出来；每个用例可以改它（`useGames` 的 mock 读同一份）。
   */
  catalog: [
    { slug: 'night-train', gridSize: 9 },
    { slug: 'day-boat', gridSize: 5 },
    { slug: 'dusk-tower', gridSize: 6 },
  ] as Array<{ slug: string; gridSize: number }>,
  /**
   * v0.8.7 §4：主题的标记（主题概览页那份）。`useForbiddenSymbolByCode` 的 mock
   * 读它，于是「谜题没配 → 跟随主题」这条能在页面级断言。
   */
  theme: {
    mark: null as UploadedImage | null,
    /** v0.8.7 §7：主题那一套工具按钮图标；默认没配。 */
    toolIcons: null as GameToolIcons | null,
    /** v0.9.3 §7；v0.9.5：主题的两档校验颜色；默认没配。 */
    checkStyle: null as ThemeCheckColors | null,
    /** v0.9.2 §2；v0.9.5 合并：主题的**那一圈**图（长按 + 校验共用）；默认没配。 */
    ring: null as ThemeRing | null,
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
      // v0.7.14：题面（全局线索 + 结束语）随谜题版本行一起下发。
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
      // v0.8.6：默认没配置 —— 这一页的老行为（`×` 字形）必须先原样成立。
      mark: null as UploadedImage | null,
      /** v0.8.7 §7：谜题自己那一套工具按钮图标；默认没配。 */
      toolIcons: null as GameToolIcons | null,
    },
  },
}));

vi.mock('@/hooks/useGames', () => ({
  /**
   * v0.9.5：`useCatalog` 读的是**同一个** `useGames()`（`ApiGameSource` 里就是它）。
   * 这里给一份清单，「下一关」才有的可算；`catalog` 是可变夹具，用例按需改。
   *
   * `detailPending` 也是夹具：真浏览器里数据是异步到的，页面会先渲染一次
   * 「画布还没到」（`gridSize = 0`）的形态。续计时那个 bug 只在那一拍上出现。
   */
  useGameDetail: () =>
    fixture.detailPending
      ? { data: undefined, isLoading: true, isError: false }
      : { data: fixture.detail, isLoading: false, isError: false },
  useGames: () => ({ data: fixture.catalog, isLoading: false, isError: false, error: null }),
}));
vi.mock('@/hooks/useAssets', () => ({ useAssets: () => ({ data: [] }) }));
vi.mock('@/hooks/useThemes', () => ({
  /**
   * v0.8.7 §4；v0.9.5 更名：标记的「跟随主题」那一档。真实 hook 返回「按编码查表」
   * 的函数，这里按同一个签名返回一个常量。
   */
  useMarkByCode: () => () => fixture.theme.mark,
  /**
   * v0.9.2 §2；v0.9.5：**那一圈** —— 长按计时环与校验圈共用一张。这一套里由
   * `fixture.theme.ring` 决定，默认「没配」。
   */
  useRingByCode: () => () => fixture.theme.ring,
  // v0.9.3 §3：校验的两档颜色 —— 默认不配，落回内置绿 / 红。
  useCheckColorsByCode: () => () => fixture.theme.checkStyle,
  /**
   * v0.8.7 §7：三枚工具按钮图标。同样按编码查表，这里返回 fixture 里那一套
   * （默认 `null` = 谁都没配，按钮画内置图标）。
   */
  useToolIconsByCode: () => () => fixture.theme.toolIcons,
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

/** v0.9.5：结算卡上两枚跳转按钮真的把地址改了 —— 只读它，不渲染目标页。 */
function PathProbe(): JSX.Element {
  const location = useLocation();
  return <p data-testid="route-path">{location.pathname}</p>;
}

/**
 * v0.9.5 追加：「下一关」的真实路径 = **同一个 router 内换地址**。
 *
 * 把 `useNavigate()` 挂到一个不渲染任何东西的组件上，用例就能在同一个 router
 * 实例里跳转 —— 这是「组件不重建、状态可能串过去」唯一能被测到的形态。
 */
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
    // v0.9.5：那一圈同样是可变夹具（长按 + 校验共用）。
    fixture.theme.ring = null;
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
          {/* v0.9.5：结算卡上的「下一关 / 返回谜题列表」跳到哪儿 —— 只读地址。 */}
          <PathProbe />
          {/* v0.9.5：让用例能在同一个 router 里换关（见 `NavigateProbe`）。 */}
          <NavigateProbe />
        </MemoryRouter>,
      );
    });
  }

  /**
   * v0.9.5 追加：在**同一个 router** 里换关 —— 模拟「下一关」的真实路径。
   *
   * 用 `<MemoryRouter>` + `navigate()` 而不是重新 `root.render(...)`：后者会换掉
   * 整棵树，测不到「组件不重建 → 状态串过去」这件事，而那正是这一组用例要抓的。
   */
  function navigateTo(nextSlug: string): void {
    act(() => {
      routerNavigate?.(`/play/${nextSlug}`);
    });
  }

  const path = (): string =>
    document.querySelector('[data-testid="route-path"]')?.textContent ?? '';

  /**
   * jsdom 的元素尺寸恒为 0，而 `fit` / `zoomBy` 都要读真实矩形才有意义。
   * 给中列一个固定视口，缩放与重置才会落到可断言的数值上。
   */
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

  /** v0.9.5：`/api/files/…` 那一份印 —— 只是地址，不需要真的能加载。 */
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
  function submitAndSettle(): void {
    act(() => container.querySelector<HTMLButtonElement>('button[title="提交"]')?.click());
    for (let i = 0; i < 4; i += 1) act(() => vi.advanceTimersByTime(GAME_CHECK_STEP_MS));
  }

  function footerButton(label: string): HTMLButtonElement | undefined {
    return Array.from(
      document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button'),
    ).find((node) => node.textContent?.trim() === label);
  }

  it('restores a saved board — 头像、编号、标记都还在', () => {
    seedSave({
      board: {
        '0,0': { kind: 'participant', index: 1 },
        '1,1': { kind: 'numbers', entries: [2, 3] },
        '4,4': { kind: 'forbidden' },
      },
    });
    render();
    // v0.9.0 §17：计数器没了，直接看棋盘 —— 放置层出现、那一格 × 画出来了。
    expect(container.querySelector('main div[style*="z-index: 40"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="forbidden-4,4"]')).not.toBeNull();
    // 水合不能反过来把存档清掉：读到的还是那三格。
    const kept = JSON.parse(window.localStorage.getItem(gameProgressKey('night-train')) ?? '{}');
    expect(Object.keys(kept.board ?? {})).toHaveLength(3);
  });

  /**
   * v0.7.11：提交状态不再是一个要恢复的东西 —— 恢复的是**用时**。
   * 存档里写的是累计毫秒，所以「03:07」进页面就该在右栏亮着，并且从这里继续走。
   */
  it('restores the accumulated time instead of a submitted tick', () => {
    window.localStorage.setItem(
      gameTimerKey('night-train'),
      JSON.stringify({ gridSize: 9, participantCount: 3, elapsedMs: 187_000 }),
    );
    render();
    expect(container.textContent).toContain('03:07');
    expect(
      container.querySelector('[title="已提交，可继续摆放后再次提交"]'),
    ).toBeNull();
  });

  /**
   * v0.9.5 修的一个真 bug（v0.7.11 的续计时在真浏览器里从来没生效过）：
   *
   * 页面第一次渲染时数据还没到（`gridSize = 0`），计时落盘那条 effect 的依赖随后
   * 变一次，于是**清理函数**先跑了一次 —— 它写的是 `elapsedRef`（那时还是 0），
   * 而 `writeGameTimer(…, 0)` 的语义是**删键**。删的正是紧接着要读的那条存档。
   *
   * 这条用例模拟「数据晚一拍才到」：先给一份空 detail 渲染一次，再换成真的。
   * 水合之后秒表必须还是存档里的 03:07 —— 而且落盘不能把它清掉。
   */
  it('数据晚一拍才到时，存档里的计时不会被抢在读取之前删掉', () => {
    window.localStorage.setItem(
      gameTimerKey('night-train'),
      JSON.stringify({ gridSize: 9, participantCount: 3, elapsedMs: 187_000 }),
    );
    fixture.detailPending = true;
    render();
    // 数据到齐，同一个 root 再渲染一次 —— 这正是真浏览器里的那一拍。
    fixture.detailPending = false;
    render();

    expect(container.textContent).toContain('03:07');
    // 落盘写回的是那条存档，不是「0 毫秒 → 删键」。
    const stored = JSON.parse(
      window.localStorage.getItem(gameTimerKey('night-train')) ?? 'null',
    ) as { elapsedMs?: number } | null;
    expect(stored?.elapsedMs ?? 0).toBeGreaterThanOrEqual(187_000);
  });

  /**
   * v0.9.5 修的第二个口子：**换关**。
   *
   * 从定案卡点「下一关」时组件不重建，新一关的数据还在路上。旧版这里会拿着
   * 上一关的累计毫秒去写新一关的键（指纹 `gridSize: 0`）—— 成绩串了关，留下的
   * 还是一条永远读不回来的垃圾。现在换关时先关闸，等新一关读完自己的存档。
   */
  it('换关时不把上一关的用时写进下一关的计时键', () => {
    window.localStorage.setItem(
      gameTimerKey('night-train'),
      JSON.stringify({ gridSize: 9, participantCount: 3, elapsedMs: 187_000 }),
    );
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
    const kept = JSON.parse(
      window.localStorage.getItem(gameTimerKey('night-train')) ?? 'null',
    ) as { elapsedMs?: number } | null;
    expect(kept?.elapsedMs ?? 0).toBeGreaterThanOrEqual(187_000);
  });

  /**
   * v0.9.5 追加（用户反馈）：「进入下一关时，应该加载这一关的状态和数据，
   * 不要复用上一关的状态和数据」。
   *
   * 真实路径是**同一个 router 内换地址** —— 组件不重建，于是逐关状态全都留在
   * 原地：缩放 / 平移、放置模式、联动激活、长按环、脉冲表……真浏览器实测过，
   * 在 130% 的 A 关点「下一关」，B 关仍停在 130% 与 A 的平移量（B 是 6×6，那张
   * 纸直接被摆到了屏幕外）。
   *
   * 修法是在渲染层外面套一层按关卡变化的 `key`：换关 = 卸载重建，状态自然归零，
   * 新一关再由自己的数据水合。这里钉「重建过」这一件事 —— 缩放回到 100% 是
   * 最直观的投影，但真正要保证的是**全部**状态归零，所以下面再加一条棋盘断言。
   */
  it('换关时缩放 / 平移回到这一关自己的初值，不继承上一关', () => {
    window.localStorage.setItem(
      gameTimerKey('night-train'),
      JSON.stringify({ gridSize: 9, participantCount: 3, elapsedMs: 187_000 }),
    );
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

  /**
   * 同一件事的另一面：**结案状态**也不该跟到下一关。
   *
   * 结算卡开着的时候点「下一关」，新一关若复用了 `result` / `checkRun`，那张
   * 「定案」卡会跟着过去。这里钉它不跟 —— 换关之后画面上没有结算卡。
   */
  it('换关时上一关的结算卡与校验圈不跟过去', () => {
    vi.useFakeTimers();
    try {
      seedPassingBoard();
      render();
      submitAndSettle();
      expect(document.body.textContent).toContain('定案');
      // 校验圈留在上一关的棋盘上（弹窗背后的那张结论图）。
      expect(container.querySelectorAll('main .press-ring-arc').length).toBeGreaterThan(0);

      fixture.detail.slug = 'day-boat';
      fixture.detail.gridSize = 5;
      navigateTo('day-boat');

      // 新一关：没有结算卡，也没有上一关那几圈。
      expect(document.body.textContent).not.toContain('定案');
      expect(container.querySelectorAll('main .press-ring-arc')).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * v0.9.4：提交未通过时弹窗**只报结论 + 一个计数**，不列谁不对 / 哪里不对。
   *
   * v0.7.12：没放完已经交不上去（按钮禁用），所以「未通过」只剩一种局面 ——
   * 三位都放了，但 1 和 2 撞在同一列、3 独自站对，因此是 `1/3 正确`。
   * 棋盘上的圈已经把这两位圈成红色，弹窗里再列一遍编号是重复信息。
   */
  /**
   * v0.9.3 §2：提交后**先逐人校验**，结论要等圈完最后一位才出来。
   *
   * 钉三件能看见的事：
   *   1. 点下提交的那一刻不弹窗，左栏先压一层遮罩（地图除外）；
   *   2. 圈是一拍一位加上去的 —— 不是一次性全亮；
   *   3. 圈到最后一位之后再一拍，结论才落下来，而且那几圈**还留在棋盘上**。
   */
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

      act(() =>
        container.querySelector<HTMLButtonElement>('button[title="提交"]')?.click(),
      );
      // 四处遮罩同时出现、圈还没画、结论也还没出来。
      const scrims = container.querySelectorAll<HTMLElement>('[data-testid="check-scrim"]');
      expect(scrims).toHaveLength(4);
      // v0.9.4：左栏 / 右栏 / 中列留白 / 画布底色层各一层完整遮罩，都用弹窗 overlay 的颜色。
      expect([...scrims].every((el) => el.className.includes(DIALOG_OVERLAY_TINT_CLASS))).toBe(true);
      expect([...scrims].every((el) => el.style.backgroundColor === '')).toBe(true);
      expect([...scrims].every((el) => el.style.mixBlendMode === '')).toBe(true);
      expect(container.querySelector('.fixed.inset-0[data-testid="check-scrim"]')).toBeNull();
      expect(rings()).toBe(0);
      expect(dialog()).not.toContain('定案');

      act(() => vi.advanceTimersByTime(GAME_CHECK_STEP_MS));
      expect(rings()).toBe(1);
      act(() => vi.advanceTimersByTime(GAME_CHECK_STEP_MS));
      expect(rings()).toBe(2);
      act(() => vi.advanceTimersByTime(GAME_CHECK_STEP_MS));
      expect(rings()).toBe(3);
      expect(dialog()).not.toContain('定案');

      // 最后再一拍才结算 —— 让最末那一圈也扫满。
      act(() => vi.advanceTimersByTime(GAME_CHECK_STEP_MS));
      expect(dialog()).toContain('定案');
      // 圈留在棋盘上：那是弹窗背后的一张结论图。
      expect(rings()).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * v0.9.4：四处独立完整遮罩 —— 左右两栏各自一层（挡点击），中列一层铺满地图区
   * （压住留白与标尺、低于画布纸所以棋盘明亮），画布底色层那一层嵌在 `canvasBase`
   * 里（只压暗纸底）。不再量视口矩形、不再四块挖洞。
   */
  it('校验遮罩分成左栏 / 右栏 / 中列留白 / 画布底色层四处，结算后一起撤掉', () => {
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
      act(() =>
        container.querySelector<HTMLButtonElement>('button[title="提交"]')?.click(),
      );

      const byArea = (area: string): HTMLElement =>
        container.querySelector<HTMLElement>(`[data-scrim-area="${area}"]`)!;
      const left = byArea('left');
      const right = byArea('right');
      const center = byArea('center');
      const canvas = byArea('canvas');
      expect(left).toBeTruthy();
      expect(right).toBeTruthy();
      expect(center).toBeTruthy();
      expect(canvas).toBeTruthy();
      // 左右两栏：遮罩直接挂在各自的 aside 里，且抬到内容之上挡点击。
      expect(left.parentElement?.tagName).toBe('ASIDE');
      expect(right.parentElement?.tagName).toBe('ASIDE');
      // v0.9.4 追加：左右遮罩越过各自朝向中列的那道边框（`-right-px` / `-left-px`），
      // 把「左栏/中列」「中列/右栏」两条分隔线也压暗，否则会比四周更亮地留在那里。
      expect(left.className).toContain('absolute inset-y-0');
      expect(left.className).toContain('-right-px');
      expect(right.className).toContain('absolute inset-y-0');
      expect(right.className).toContain('-left-px');
      expect(Number(left.style.zIndex)).toBeGreaterThan(0);
      expect(Number(right.style.zIndex)).toBeGreaterThan(0);
      // 中列：铺满地图区、压住留白与标尺，层级等于 saveMask（低于抬起的画布纸）。
      expect(center.className).toContain('absolute inset-0');
      expect(Number(center.style.zIndex)).toBe(UI_Z.saveMask);
      expect(center.parentElement?.tagName).toBe('MAIN');
      // 地图区：遮罩是 canvasBase 的子元素，跟着画布一起缩放平移；
      // 它自己不接指针，上面的格子 / 物品 / 圈照常显示。
      expect(canvas.className).toContain('pointer-events-none');
      expect(canvas.parentElement?.className).toContain('bg-background');
      expect(canvas.parentElement?.parentElement?.getAttribute('data-testid')).toBe('game-canvas');

      // 结算卡一出现四处一起撤掉 —— 不能和弹窗自己的 overlay 叠成两层黑。
      for (let i = 0; i < 4; i += 1) act(() => vi.advanceTimersByTime(GAME_CHECK_STEP_MS));
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
      act(() =>
        container.querySelector<HTMLButtonElement>('button[title="提交"]')?.click(),
      );
      // v0.9.3 §2：结论在逐人校验之后 —— 三位三拍，再加一拍收尾。
      for (let i = 0; i < 4; i += 1) act(() => vi.advanceTimersByTime(GAME_CHECK_STEP_MS));

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

  /**
   * v0.9.4 追加：`x/n` 是算出来的，不是写死的一句。三人同列时三位都带
   * column issue —— 绿圈一个也没有，正文就得是 `0/3 正确`。
   */
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
      act(() =>
        container.querySelector<HTMLButtonElement>('button[title="提交"]')?.click(),
      );
      for (let i = 0; i < 4; i += 1) act(() => vi.advanceTimersByTime(GAME_CHECK_STEP_MS));

      const dialog = document.body.textContent ?? '';
      expect(dialog).toContain('你没有找出所有人的位置！0/3 正确。未能结案。');
      expect(dialog).not.toContain('1/3');
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * v0.7.12：没有全部放好之前，提交按钮是**禁用**的；编号（候选标记）不算
   * 放好 —— 它只是自己数格子时的草稿。
   */
  it('keeps submit disabled until every participant has an avatar', () => {
    seedSave({
      board: {
        '0,0': { kind: 'numbers', entries: [1] },
        '1,1': { kind: 'numbers', entries: [2] },
        '2,2': { kind: 'numbers', entries: [3] },
      },
    });
    render();
    const blocked = container.querySelector<HTMLButtonElement>(
      'button[title="尚未将人物放置完全"]',
    );
    expect(blocked).not.toBeNull();
    expect(blocked?.disabled).toBe(true);

    // 同一份棋盘换成三个头像 —— 按钮点亮。
    act(() => root.unmount());
    root = createRoot(container);
    seedSave({
      board: {
        '0,0': { kind: 'participant', index: 1 },
        '2,2': { kind: 'participant', index: 2 },
        '4,4': { kind: 'participant', index: 3 },
      },
    });
    render();
    const ready = container.querySelector<HTMLButtonElement>(
      'button[title="提交"]',
    );
    expect(ready).not.toBeNull();
    expect(ready?.disabled).toBe(false);
  });

  /**
   * v0.7.12：提交未通过 →「继续游戏」，秒表接着走。
   *
   * 这里用假定时器把时间「推」过去，比真的等 2 秒稳，也能顺便确认停表那一刻
   * 数字确实冻住（而不是悄悄继续数）。
   */
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
      window.localStorage.setItem(
        gameTimerKey('night-train'),
        JSON.stringify({ gridSize: 9, participantCount: 3, elapsedMs: 3000 }),
      );
      render();

      const clock = (): string | null =>
        container.querySelector('[data-testid="game-timer"]')?.textContent ?? null;
      expect(clock()).toBe('00:03');

      act(() =>
        container
          .querySelector<HTMLButtonElement>('button[title="提交"]')
          ?.click(),
      );
      expect(clock()).toBe('00:03');

      // 弹窗开着的时候钟是停的。
      // v0.9.3 §2：结论在逐人校验之后 —— 先把那几拍推完，弹窗才出现。
      for (let i = 0; i < 4; i += 1) act(() => vi.advanceTimersByTime(GAME_CHECK_STEP_MS));
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

  /**
   * v0.6.3 §3.4: the deployed game renders the roster the puzzle was published
   * with — the column count is frozen into the snapshot, so what the author
   * typed in 「基本信息」 is what players see.
   */
  it('renders the roster in the columns the snapshot carries', () => {
    render();
    const matrix = container.querySelector('[data-testid="roster-matrix"]');
    const raw = matrix?.getAttribute('style') ?? '';
    expect(/repeat\(3,/.test(raw)).toBe(true);
    // Three participants in three columns → one row, and the left column is
    // wide enough for them (3 × 110 + 2 × 14 + 16 padding + the aside's own
    // 1px separator border — without that last pixel the scrollbar is back).
    const aside = container.querySelector('aside');
    expect(aside?.style.width).toBe('375px');
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

  /**
   * v0.7.14（docs/v0.7.14.md §4）：题面与结束语。
   *
   * v0.8.3 精简：左栏的堆叠顺序（标题 → 题面 → 名册）那半段删掉了 —— 布局。
   * 留下的这一半是**剧透**：没提交之前，结束语一个字都不该出现在页面里。
   */
  /**
   * v0.9.3 §5：配了圈图时，**只画那张被染成结果色的图**，不再另画一道本色弧。
   *
   * 棋盘里让 1、2 同排（未通过）、3 独自站对角线（通过），一次提交就能同时
   * 看到两档颜色。断言走 DOM：每位的 `<image filter>` 指向一条
   * `feColorMatrix`，矩阵值等于对应结果色的纯色矩阵；同时 `press-ring-arc`
   * 只剩遮罩里那 3 条白色的（扇形刻度），没有结果色的进度弧 —— 颜色完全由
   * 已上传的图片承载。
   */
  it('配了圈图：每位的结果色染到那张图上', () => {
    vi.useFakeTimers();
    try {
      // v0.9.5：圈图并进主题的 `ring`，校验只剩两档颜色。
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
      act(() =>
        container.querySelector<HTMLButtonElement>('button[title="提交"]')?.click(),
      );
      for (let i = 0; i < 4; i += 1) act(() => vi.advanceTimersByTime(GAME_CHECK_STEP_MS));

      const images = Array.from(container.querySelectorAll('main image[filter]'));
      expect(images).toHaveLength(3);
      expect(
        images.every((image) => image.getAttribute('href') === '/api/files/themes/3/check-ring/seal.webp'),
      ).toBe(true);
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
      act(() =>
        container.querySelector<HTMLButtonElement>('button[title="提交"]')?.click(),
      );
      for (let i = 0; i < 4; i += 1) act(() => vi.advanceTimersByTime(GAME_CHECK_STEP_MS));

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

  /**
   * v0.9.3 §3：印章。只有**作者给提交按钮配了图**时才盖 —— 内置那枚 lucide 勾是
   * 界面图标，盖上去像把按钮按进纸里，不是一个印。
   */
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
      act(() =>
        container.querySelector<HTMLButtonElement>('button[title="提交"]')?.click(),
      );
      for (let i = 0; i < 4; i += 1) act(() => vi.advanceTimersByTime(GAME_CHECK_STEP_MS));
      // 没配 —— 只有字，没有印。
      expect(document.querySelector('[data-testid="verdict-stamp"]')).toBeNull();

      act(() => root.unmount());
      root = createRoot(container);
      fixture.detail.puzzle.toolIcons = { submit: { path: 'puzzles/7/tool-icons/submit/a.webp' } };
      render();
      act(() =>
        container.querySelector<HTMLButtonElement>('button[title="提交"]')?.click(),
      );
      for (let i = 0; i < 4; i += 1) act(() => vi.advanceTimersByTime(GAME_CHECK_STEP_MS));

      const stamp = document.querySelector<HTMLImageElement>('[data-testid="verdict-stamp"]');
      expect(stamp).not.toBeNull();
      expect(stamp?.getAttribute('src')).toBe('/api/files/puzzles/7/tool-icons/submit/a.webp');
    } finally {
      fixture.detail.puzzle.toolIcons = null;
      vi.useRealTimers();
    }
  });

  /**
   * v0.9.5：两张结果卡各多一枚「返回谜题列表」—— 一局结束，玩家的下一个动作通常
   * 不是再点棋盘，而是挑下一关。落点与左上角那个箭头同一个地址（`listHref`）。
   */
  describe('结果卡的出口（v0.9.5）', () => {
    it('通过：返回谜题列表 → /play', () => {
      vi.useFakeTimers();
      try {
        seedPassingBoard();
        render();
        submitAndSettle();

        const back = footerButton('返回谜题列表');
        expect(back).toBeDefined();
        act(() => back?.click());
        expect(path()).toBe('/play');
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
        expect(path()).toBe('/play');
      } finally {
        vi.useRealTimers();
      }
    });

    /**
     * 「下一关」＝清单里排在当前之后、还没通过的第一关。当前是 `night-train`
     * （清单第 0 条），后面那两关都没做过 → 跳 `day-boat`。
     */
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

    /**
     * 后面没有没做过的关时，「再玩一次」重新当主按钮 —— 四枚全是描边的话，
     * 结案卡上就读不出「下一步建议做什么」了。这里只看类名里的实心底色，
     * 不钉具体 token。
     */
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

  /**
   * v0.9.5：通过时落一条记录，列表页据此盖印并写出完成用时。
   *
   * 三条行为分开钉：写得对（用时 + 印地址）、没配印也能通过（`stampUrl` 为 null）、
   * 未通过不写。
   */
  describe('通过记录（v0.9.5）', () => {
    it('通过 → 记下用时与那枚印的地址', () => {
      vi.useFakeTimers();
      try {
        window.localStorage.setItem(
          gameTimerKey('night-train'),
          JSON.stringify({ gridSize: 9, participantCount: 3, elapsedMs: 187_000 }),
        );
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

  /**
   * v0.8.6（docs/v0.8.6.md §4）：标记可以上传一张图。
   *
   * 只钉**画出来的是谁**：棋盘上那一格从 `×` 字形换成 `<img>`，地址由上传文件的
   * 相对路径拼出来；没配置时仍然是原来那个 `×`。尺寸、内缩、类名都是外观，
   * 不在这里钉。
   */
  describe('标记用上传的图片（v0.8.6）', () => {
    const symbolPath = 'puzzles/12/forbidden-symbol/red.webp';
    const symbolUrl = '/api/files/puzzles/12/forbidden-symbol/red.webp';

    it('puts the uploaded image on the board', () => {
      fixture.detail.puzzle.mark = { path: symbolPath };
      seedSave({ board: { '4,4': { kind: 'forbidden' } } });
      render();

      const placed = container.querySelector('[data-testid="forbidden-4,4"]');
      expect(placed).not.toBeNull();
      expect(placed?.tagName).toBe('IMG');
      expect(placed?.getAttribute('src')).toBe(symbolUrl);
    });

    it('keeps the × glyph when the puzzle configures no symbol', () => {
      seedSave({ board: { '4,4': { kind: 'forbidden' } } });
      render();

      const placed = container.querySelector('[data-testid="forbidden-4,4"]');
      expect(placed).not.toBeNull();
      expect(placed?.tagName).toBe('text');
      expect(placed?.textContent).toBe('×');
    });

    /**
     * v0.8.7 §4：「谜题不配置标记图标，则默认使用主题的配置，谜题无需额外配置」。
     * 页面级只认结果 —— 这一格画出来的到底是哪张图。
     */
    it('follows the theme when the puzzle configures nothing', () => {
      const themePath = 'themes/3/forbidden-symbol/ink.webp';
      fixture.theme.mark = { path: themePath };
      seedSave({ board: { '4,4': { kind: 'forbidden' } } });
      render();

      const placed = container.querySelector('[data-testid="forbidden-4,4"]');
      expect(placed?.tagName).toBe('IMG');
      expect(placed?.getAttribute('src')).toBe('/api/files/themes/3/forbidden-symbol/ink.webp');
    });

    it('the puzzle’s own image still wins over the theme’s', () => {
      fixture.detail.puzzle.mark = { path: symbolPath };
      fixture.theme.mark = { path: 'themes/3/forbidden-symbol/ink.webp' };
      seedSave({ board: { '4,4': { kind: 'forbidden' } } });
      render();

      expect(
        container.querySelector('[data-testid="forbidden-4,4"]')?.getAttribute('src'),
      ).toBe(symbolUrl);
    });

    it('keeps the × glyph for an old version row that has no key at all', () => {
      // v0.8.6 之前发布的版本行里没有这个键（连 `null` 都没有）。
      delete (fixture.detail.puzzle as { mark?: unknown }).mark;
      seedSave({ board: { '4,4': { kind: 'forbidden' } } });
      render();

      expect(container.querySelector('[data-testid="forbidden-4,4"]')?.tagName).toBe('text');
    });

    it('previews the same image in the tool-hint layer', () => {
      fixture.detail.puzzle.mark = { path: symbolPath };
      render();
      sizeCanvas();
      // jsdom 没有真实布局：先按视口重排一次，再把指针放到画布中心。
      act(() => container.querySelector<HTMLButtonElement>('button[aria-label="重置视图"]')?.click());
      act(() => container.querySelector<HTMLButtonElement>('button[title="标记"]')?.click());
      act(() => {
        container
          .querySelector('main')
          ?.dispatchEvent(
            new MouseEvent('pointermove', { bubbles: true, clientX: 450, clientY: 350 }),
          );
      });

      const preview = Array.from(container.querySelectorAll('main img')).find(
        (node) => node.getAttribute('src') === symbolUrl,
      );
      expect(preview).not.toBeUndefined();
    });
  });

  /**
   * v0.8.7 §7：「清除 / 撤回 / 提交」三枚按钮的画。页面级只认结果 —— 按钮里到底是
   * 一张 `<img>` 还是内置图标（`data-testid` 只在画图时出现）。
   */
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

    /**
     * v0.9.1 §3 / §5：清除工具的悬停预览必须与按钮**同一张图** —— 作者配了图，
     * 指针底下就不能还画内置橡皮。§5 起它还比内置字形大一圈（60%）并带白描边。
     */
    it('清除工具触碰方格时预览的是按钮那张图（更大 + 白描边）', () => {
      fixture.detail.puzzle.toolIcons = { clear: { path: 'puzzles/7/tool-icons/clear/own.webp' } };
      render();
      sizeCanvas();
      act(() => container.querySelector<HTMLButtonElement>('button[aria-label="重置视图"]')?.click());
      // 短按清除按钮 = 切换清除工具（按住 800ms 才是清空全部，见 v0.9.2 §3）。
      act(() => {
        const clear = container.querySelector<HTMLButtonElement>(
          'button[title="清除放置，长按清空全部"]',
        );
        clear?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
        clear?.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 }));
      });
      act(() => {
        container
          .querySelector('main')
          ?.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 450, clientY: 350 }));
      });

      const preview = Array.from(container.querySelectorAll('main img')).find(
        (node) => node.getAttribute('src') === '/api/files/puzzles/7/tool-icons/clear/own.webp',
      ) as HTMLImageElement | undefined;
      expect(preview).not.toBeUndefined();

      // §5：60% 的格子宽（比内置橡皮的 42% 大一圈）。
      const cellBox = preview?.parentElement as HTMLElement | null;
      const total = Number.parseFloat(cellBox?.style.width ?? '0');
      expect(total).toBeGreaterThan(0);
      expect(Number.parseFloat(preview?.style.width ?? '0')).toBeCloseTo(total * 0.6, 1);

      // §5：白色描边 —— 4 向 drop-shadow，颜色必须是 #ffffff。
      const filter = preview?.style.filter ?? '';
      expect(filter).toContain('drop-shadow');
      expect(filter.match(/#ffffff/g)).toHaveLength(4);
    });
  });

  /**
   * v0.9.0 §17：右栏的三处收纳 —— 统计删掉、视图簇沉底、四枚图标放大。
   *
   * 这三件事都发生在**共享**的 `GamePage.tsx`：工坊 `/play/:slug` 与播放器
   * `/loredoku/:code/play/:key` 挂的是同一个组件，所以不存在两份布局要同步。
   */
  describe('右栏布局（v0.9.0 §17）', () => {
    /** 右栏是第二个 `<aside>`（第一个是左列的题面 / 名册）。 */
    function toolbar(): Element {
      const asides = container.querySelectorAll('aside');
      const right = asides[asides.length - 1];
      if (!right) throw new Error('右栏没渲染出来');
      return right;
    }

    it('右下角不再有「已放置 / 可回退」两行统计', () => {
      render();
      expect(container.textContent).not.toContain('已放置');
      expect(container.textContent).not.toContain('可回退');
    });

    it('放大 / 缩小 / 重置 / 标尺这一簇是右栏的最后一个子元素', () => {
      render();
      const last = toolbar().lastElementChild;
      expect(last).not.toBeNull();
      // `mt-auto` 是「沉到底边」的唯一手段：统计那块删掉后，不能再靠它顶下去。
      expect(last?.className).toContain('mt-auto');
      for (const label of ['放大', '缩小', '重置视图', '显示 / 隐藏标尺']) {
        expect(last?.querySelector(`button[aria-label="${label}"]`)).not.toBeNull();
      }
      expect(last?.textContent).toContain('100%');
    });

    it('四枚工具按钮的图标都是 32px（h-8 w-8）', () => {
      render();
      const selectors = [
        'button[title="标记"]',
        'button[title="清除放置，长按清空全部"]',
        'button[title="当前没有可以回退的步骤"]',
        'button[title="尚未将人物放置完全"]',
      ];
      for (const selector of selectors) {
        const button = container.querySelector<HTMLButtonElement>(selector);
        expect(button).not.toBeNull();
        const icon = button?.querySelector('svg, img');
        expect(icon?.classList.contains('h-8')).toBe(true);
        expect(icon?.classList.contains('w-8')).toBe(true);
      }
    });

    /**
     * v0.9.1 §1：按钮不可用时，光标变成「禁用」并给一句「为什么不能点」。
     *
     * 禁用的 `<button>` 因基类的 `disabled:pointer-events-none` 接不到 hover，
     * 所以光标与提示都挂在**外面那层 span** 上 —— 这条测试钉住「span 才是响应者」，
     * 免得哪天顺手把 span 去掉、工具栏又变回「点了没反应也没解释」。
     */
    describe('禁用状态的光标与提示（v0.9.1 §1）', () => {
      function expectDisabledHint(selector: string, text: string): void {
        const button = container.querySelector<HTMLButtonElement>(selector);
        expect(button, selector).not.toBeNull();
        expect(button?.disabled, selector).toBe(true);
        const wrapper = button?.parentElement;
        expect(wrapper?.tagName, selector).toBe('SPAN');
        expect(wrapper?.className, selector).toContain('cursor-not-allowed');
        expect(wrapper?.getAttribute('title'), selector).toBe(text);
      }

      it('回退：不可用时 cursor-not-allowed +「当前没有可以回退的步骤」', () => {
        render();
        expectDisabledHint('button[title="当前没有可以回退的步骤"]', '当前没有可以回退的步骤');
      });

      it('提交：没放完时 cursor-not-allowed +「尚未将人物放置完全」', () => {
        render();
        expectDisabledHint('button[title="尚未将人物放置完全"]', '尚未将人物放置完全');
      });
    });

    it('作者上传的四张图也按 32px 显示，不回落到 20px', () => {
      fixture.theme.toolIcons = {
        clear: { path: 'themes/3/tool-icons/clear/a.webp' },
        undo: { path: 'themes/3/tool-icons/undo/b.webp' },
        submit: { path: 'themes/3/tool-icons/submit/c.webp' },
      };
      fixture.detail.puzzle.mark = { path: 'puzzles/7/forbidden-symbol/x.webp' };
      render();

      const images = Array.from(toolbar().querySelectorAll('img'));
      expect(images).toHaveLength(4);
      for (const image of images) {
        expect(image.classList.contains('h-8')).toBe(true);
        expect(image.classList.contains('w-8')).toBe(true);
      }
    });
  });
});
