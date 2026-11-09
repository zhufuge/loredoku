import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { GAME_CHECK_STEP_MS } from '@loredoku/shared';
import type { ForbiddenSymbolImage, GameToolIcons, ThemeCheckStyle } from '@loredoku/shared';
import { installMatchMedia, type MatchMediaStub } from '@/testing/matchMedia';
import { imageTintMatrix } from '@/components/common/PressRing';
import { GAME_PROGRESS_VERSION, gameProgressKey } from '@/lib/gameProgress';
import { gameTimerKey } from '@/lib/gameTimer';
import ApiGamePage from './ApiGamePage';

/**
 * v0.6.2（docs/v0.6.2.md §3 / §4）开出的页面级测试，v0.7.11 按新行为重写：
 *
 * 1. 进页面时把本地存档恢复成棋盘 —— **不再**有「已提交」这个可恢复的状态，
 *    取而代之的是**计时**：关掉页面再回来，秒表接着走；
 * 2. 右栏的缩放簇真的能改比例，重置能回到 100%；
 * 3. 提交是一次结算：未通过时弹窗只列**谁不对**。
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
   * v0.8.7 §4：主题的禁止符号（主题概览页那份）。`useForbiddenSymbolByCode` 的 mock
   * 读它，于是「谜题没配 → 跟随主题」这条能在页面级断言。
   */
  theme: {
    forbiddenSymbol: null as ForbiddenSymbolImage | null,
    /** v0.8.7 §7：主题那一套工具按钮图标；默认没配。 */
    toolIcons: null as GameToolIcons | null,
    /** v0.9.3 §7：主题级的校验样式（两档颜色 + 圈图）；默认没配。 */
    checkStyle: null as ThemeCheckStyle | null,
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
      forbiddenSymbol: null as ForbiddenSymbolImage | null,
      /** v0.8.7 §7：谜题自己那一套工具按钮图标；默认没配。 */
      toolIcons: null as GameToolIcons | null,
    },
  },
}));

vi.mock('@/hooks/useGames', () => ({
  useGameDetail: () => ({ data: fixture.detail, isLoading: false, isError: false }),
}));
vi.mock('@/hooks/useAssets', () => ({ useAssets: () => ({ data: [] }) }));
vi.mock('@/hooks/useThemes', () => ({
  /**
   * v0.8.7 §4：禁止符号的「跟随主题」那一档。真实 hook 返回「按编码查表」的函数，
   * 这里按同一个签名返回一个常量。
   */
  useForbiddenSymbolByCode: () => () => fixture.theme.forbiddenSymbol,
  // v0.9.2 §2：长按计时环的图 —— 这一套不测它，主题当作「没配」。
  usePressRingByCode: () => () => null,
  // v0.9.3 §3 / §7：校验样式 —— 默认不配，落回内置绿 / 红。
  useCheckStyleByCode: () => () => fixture.theme.checkStyle,
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

describe('GamePage — 本地存档与视图缩放（v0.6.2）', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.localStorage.clear();
    fixture.detail.puzzle.forbiddenSymbol = null;
    fixture.theme.forbiddenSymbol = null;
    // v0.9.0 §17：这两套也是 fixture 上的可变状态 —— 不重置的话，图标用例里配的
    // 那几张图会漏到后面的右栏布局用例里（它们要求「谁都没配」）。
    fixture.detail.puzzle.toolIcons = null;
    fixture.theme.toolIcons = null;
    // v0.9.3 §7：圈图与两档颜色也是 fixture 上的可变状态，别漏到别的用例。
    fixture.theme.checkStyle = null;
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
          </Routes>
        </MemoryRouter>,
      );
    });
  }

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

  it('restores a saved board — 头像、编号、禁止符号都还在', () => {
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
   * v0.7.11：提交未通过时弹窗只说**谁不对**，不说为什么。
   *
   * v0.7.12：没放完已经交不上去（按钮禁用），所以「未通过」只剩一种局面 ——
   * 三位都放了，但 1 和 2 撞在同一列。弹窗该是两条「位置不对」，不牵扯 3。
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
      // 遮罩出来了、圈还没画、结论也还没出来。
      expect(container.querySelector('[data-testid="check-scrim"]')).not.toBeNull();
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

  it('lists the offending participants (and nothing more) when a submit fails', () => {
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
      expect(dialog).toContain('提交未通过');
      expect(dialog).toContain('编号 1');
      expect(dialog).toContain('编号 2');
      expect(dialog).toContain('位置不对');
      // 3 站在自己的行列上，不该被点名。
      expect(dialog).not.toContain('编号 3');
      expect(dialog).not.toContain('未放置');
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
      fixture.theme.checkStyle = {
        passColor: '#16A34A',
        failColor: '#DC2626',
        ring: { path: 'themes/3/check-ring/seal.webp' },
      };
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
   * v0.8.6（docs/v0.8.6.md §4）：禁止符号可以上传一张图。
   *
   * 只钉**画出来的是谁**：棋盘上那一格从 `×` 字形换成 `<img>`，地址由上传文件的
   * 相对路径拼出来；没配置时仍然是原来那个 `×`。尺寸、内缩、类名都是外观，
   * 不在这里钉。
   */
  describe('禁止符号用上传的图片（v0.8.6）', () => {
    const symbolPath = 'puzzles/12/forbidden-symbol/red.webp';
    const symbolUrl = '/api/files/puzzles/12/forbidden-symbol/red.webp';

    it('puts the uploaded image on the board', () => {
      fixture.detail.puzzle.forbiddenSymbol = { path: symbolPath };
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
     * v0.8.7 §4：「谜题不配置禁止符号图标，则默认使用主题的配置，谜题无需额外配置」。
     * 页面级只认结果 —— 这一格画出来的到底是哪张图。
     */
    it('follows the theme when the puzzle configures nothing', () => {
      const themePath = 'themes/3/forbidden-symbol/ink.webp';
      fixture.theme.forbiddenSymbol = { path: themePath };
      seedSave({ board: { '4,4': { kind: 'forbidden' } } });
      render();

      const placed = container.querySelector('[data-testid="forbidden-4,4"]');
      expect(placed?.tagName).toBe('IMG');
      expect(placed?.getAttribute('src')).toBe('/api/files/themes/3/forbidden-symbol/ink.webp');
    });

    it('the puzzle’s own image still wins over the theme’s', () => {
      fixture.detail.puzzle.forbiddenSymbol = { path: symbolPath };
      fixture.theme.forbiddenSymbol = { path: 'themes/3/forbidden-symbol/ink.webp' };
      seedSave({ board: { '4,4': { kind: 'forbidden' } } });
      render();

      expect(
        container.querySelector('[data-testid="forbidden-4,4"]')?.getAttribute('src'),
      ).toBe(symbolUrl);
    });

    it('keeps the × glyph for an old version row that has no key at all', () => {
      // v0.8.6 之前发布的版本行里没有这个键（连 `null` 都没有）。
      delete (fixture.detail.puzzle as { forbiddenSymbol?: unknown }).forbiddenSymbol;
      seedSave({ board: { '4,4': { kind: 'forbidden' } } });
      render();

      expect(container.querySelector('[data-testid="forbidden-4,4"]')?.tagName).toBe('text');
    });

    it('previews the same image in the tool-hint layer', () => {
      fixture.detail.puzzle.forbiddenSymbol = { path: symbolPath };
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
      fixture.detail.puzzle.forbiddenSymbol = { path: 'puzzles/7/forbidden-symbol/x.webp' };
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
