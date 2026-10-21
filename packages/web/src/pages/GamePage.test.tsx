import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { installMatchMedia, type MatchMediaStub } from '@/testing/matchMedia';
import { GAME_PROGRESS_VERSION, gameProgressKey } from '@/lib/gameProgress';
import { GamePage } from './GamePage';

/**
 * v0.6.2（docs/v0.6.2.md §3 / §4）：游戏页的两件事 ——
 *
 * 1. 进页面时把本地存档恢复成棋盘，已提交的勾也一起恢复；
 * 2. 右栏的缩放簇真的能改比例，重置能回到 100%。
 *
 * 页面级只钉这两条**对外可观察**的结果（步数计数器 / 提交按钮的提示语 / 百分比），
 * 存档本身的清洗与失效规则在 `src/lib/gameProgress.test.ts` 里逐条覆盖。
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
      description: '',
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
        submitted: false,
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

  it('restores the submitted tick as well', () => {
    seedSave({ board: { '0,0': { kind: 'participant', index: 1 } }, submitted: true });
    render();
    expect(
      container.querySelector('[title="已提交，可继续摆放后再次提交"]'),
    ).not.toBeNull();
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
