import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { installMatchMedia, type MatchMediaStub } from '@/testing/matchMedia';
import { GAME_PROGRESS_VERSION, gameProgressKey } from '@/lib/gameProgress';
import { gameTimerKey } from '@/lib/gameTimer';
import { GamePage } from './GamePage';

/**
 * v0.6.2（docs/v0.6.2.md §3 / §4）开出的页面级测试，v0.7.11 按新行为重写：
 *
 * 1. 进页面时把本地存档恢复成棋盘 —— **不再**有「已提交」这个可恢复的状态，
 *    取而代之的是**计时**：关掉页面再回来，秒表接着走；
 * 2. 右栏的缩放簇真的能改比例，重置能回到 100%；
 * 3. 提交是一次结算：未通过时弹窗只列**谁不对**。
 *
 * 页面级只钉**对外可观察**的结果（步数计数器 / 用时 / 百分比 / 弹窗文案），
 * 存档与计时的清洗规则分别在 `gameProgress.test.ts` / `gameTimer.test.ts` 里覆盖。
 */

const fixture = vi.hoisted(() => ({
  detail: {
    id: 1,
    puzzleId: 7,
    puzzleName: '夜车',
    puzzleVersionNo: 1,
    name: '夜车',
    slug: 'night-train',
    coverUrl: null,
    difficulty: 'easy',
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
    },
  },
}));

vi.mock('@/hooks/useGames', () => ({
  useGameDetail: () => ({ data: fixture.detail, isLoading: false, isError: false }),
}));
vi.mock('@/hooks/useAssets', () => ({ useAssets: () => ({ data: [] }) }));
/**
 * v0.8.0 §16.6：从合辑进来时左栏要显示主题名。这套测试没有
 * `QueryClientProvider`（也不需要），所以把它 mock 成「没有合辑上下文」——
 * 也就是单局入口那条路径，返回入口根本不该出现。
 */
vi.mock('@/hooks/useThemes', () => ({
  useThemeDeploymentBySlug: () => ({ data: undefined }),
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
            <Route path="/play/:slug" element={<GamePage />} />
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
    expect(container.textContent).toContain('已放置 3 个');
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
  it('lists the offending participants (and nothing more) when a submit fails', () => {
    seedSave({
      board: {
        '0,0': { kind: 'participant', index: 1 },
        '0,1': { kind: 'participant', index: 2 },
        '5,5': { kind: 'participant', index: 3 },
      },
    });
    render();
    act(() =>
      container.querySelector<HTMLButtonElement>('button[title="提交当前摆放（先校验）"]')?.click(),
    );

    const dialog = document.body.textContent ?? '';
    expect(dialog).toContain('提交未通过');
    expect(dialog).toContain('编号 1');
    expect(dialog).toContain('编号 2');
    expect(dialog).toContain('位置不对');
    // 3 站在自己的行列上，不该被点名。
    expect(dialog).not.toContain('编号 3');
    expect(dialog).not.toContain('未放置');
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
      'button[title="还有参与者没放好，放完才能提交"]',
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
      'button[title="提交当前摆放（先校验）"]',
    );
    expect(ready).not.toBeNull();
    expect(ready?.disabled).toBe(false);
  });

  /**
   * v0.7.12：计时在标题行最右边 —— 和「游戏名 + 尺寸」同一行，粗体淡色，
   * 没有图标。它是一条元信息，不是工具栏里的一件工具。
   */
  it('places the timer at the right end of the title row', () => {
    render();
    const timer = container.querySelector('[data-testid="game-timer"]');
    expect(timer).not.toBeNull();
    expect(timer?.textContent).toBe('00:00');
    expect(timer?.className).toContain('font-semibold');
    expect(timer?.className).toContain('text-muted-foreground');
    expect(timer?.querySelector('svg')).toBeNull();
    // 同一行的前一个元素是游戏名。
    expect(timer?.previousElementSibling?.textContent).toContain('夜车');
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
          .querySelector<HTMLButtonElement>('button[title="提交当前摆放（先校验）"]')
          ?.click(),
      );
      expect(clock()).toBe('00:03');

      // 弹窗开着的时候钟是停的。
      act(() => vi.advanceTimersByTime(2000));
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
    expect(container.textContent).toContain('已放置 0 个');
  });

  it('writes the board back to localStorage while playing', () => {
    render();
    sizeCanvas();
    // 视口是测完才有尺寸的，自适应那一遍还没跑过；点一下「重置视图」把棋盘真正
    // 摆到视口中央，下面按视口中心点算出来的格子才稳定（不依赖默认格宽）。
    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="重置视图"]')?.click());

    const forbidden = container.querySelector<HTMLButtonElement>('button[title^="禁止符号"]');
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
   * 第一半是「进来就看得见、而且排在该在的地方」：左栏里从标题读到名册，中间
   * 依次是描述、线索、参与者 —— 三样同时在视野里，谁也不用滚动去换另一个。
   * 第二半是「结束语只在通过时说话」：没提交之前，那句话一个字都不该出现在页面里。
   */
  it('stacks the 题面 between the title and the roster in the left column, but not the ending', () => {
    render();
    const aside = container.querySelector('aside');
    const brief = container.querySelector<HTMLElement>('[data-testid="game-brief"]');
    const roster = container.querySelector<HTMLElement>('[data-testid="roster-matrix"]');
    expect(aside && brief && roster).not.toBeNull();

    expect(brief?.textContent).toContain('三人三行，各归其位。');
    expect(brief?.textContent).toContain('同一行里没有重复编号');
    expect(brief?.textContent).toContain('阴影里没有编号');

    // 它属于左栏，不再压在盘面上。
    expect(aside?.contains(brief)).toBe(true);
    expect(container.querySelector('main')?.contains(brief)).toBe(false);

    // 顺序：标题 → 题面 → 名册（文档顺序就是屏幕上的上下顺序）。
    const title = aside?.querySelector('p');
    expect(title?.textContent).toContain('夜车');
    const precedes = (first: Element | null | undefined, second: Element): boolean =>
      Boolean(first && first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(precedes(title, brief as Element)).toBe(true);
    expect(precedes(brief, roster as Element)).toBe(true);

    // 结束语是过关后的一句话 —— 开局就摆在页面上，等于剧透。
    expect(document.body.textContent).not.toContain('灯灭了');
  });

  it('gives the author’s 结束语 in the dialog that says the submit passed', () => {
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
      container.querySelector<HTMLButtonElement>('button[title="提交当前摆放（先校验）"]')?.click(),
    );

    const dialog = document.body.textContent ?? '';
    expect(dialog).toContain('提交通过');
    expect(dialog).toContain('灯灭了，花园还在。');
    // 结束语没有「结束语：」这样的标签 —— 它是作者的话，不是界面在解说。
    expect(dialog).not.toContain('结束语：');
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
});
