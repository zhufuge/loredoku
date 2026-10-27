import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { installMatchMedia, type MatchMediaStub } from '@/testing/matchMedia';
import { GAME_PROGRESS_VERSION, gameProgressKey } from '@/lib/gameProgress';
import { GamePage } from './GamePage';

/**
 * v0.7.11：长按的过程可见化。
 *
 * 棋格上按住 500ms 放头像（SPEC-J02）、清除按钮上按住 500ms 清空全部
 * （SPEC-G04）—— 这两个手势此前只有结果、没有过程：按下去界面一动不动，
 * 用户只能估摸着数秒，早了白按、晚了手指发酸。这一轮给它们同一圈进度环。
 *
 * 页面级只钉四件**能看见的事**：
 *   1. 按下格子，环出现；抬手，环消失；
 *   2. 按住到 500ms，头像落下（带落定动效）而环留到抬手；
 *   3. 被规则拒绝时环立刻收回 —— 不能让一个满环停在那里冒充「放好了」；
 *   4. 清除按钮的长按画的是同一圈环，不是另一套。
 *
 * 环的几何（周长、时长变量、12 点起点）在 `PressRing.test.tsx` 里单独钉。
 */

const GRID = 9;

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

const toasts = vi.hoisted(() => ({ errors: [] as string[] }));
vi.mock('sonner', () => ({
  toast: {
    success: () => undefined,
    error: (message: string) => {
      toasts.errors.push(message);
    },
  },
}));

let media: MatchMediaStub;

beforeAll(() => {
  media = installMatchMedia(false);
});

afterAll(() => {
  media.restore();
});

describe('GamePage — 长按的过程反馈（v0.7.11）', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.localStorage.clear();
    toasts.errors.length = 0;
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

  /** jsdom 不排版，元素尺寸恒为 0 —— 给中列一个固定视口，坐标换算才有意义。 */
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

  /**
   * 格子中心的**视口**坐标。画布层带着 `translate(pan) scale(zoom)`，
   * 直接写死像素会在 fit 之后落到画布外面 —— 从真实变换里反推。
   */
  function cellCenter(x: number, y: number): { clientX: number; clientY: number } {
    const stage = container.querySelector<HTMLElement>('main > div');
    if (!stage) throw new Error('画布层没渲染出来');
    const match = /translate\((-?[\d.eE+]+)px,\s*(-?[\d.eE+]+)px\)\s*scale\((-?[\d.eE+]+)\)/.exec(
      stage.style.transform,
    );
    if (!match) throw new Error(`认不出画布变换：${stage.style.transform}`);
    const panX = Number(match[1]);
    const panY = Number(match[2]);
    const zoom = Number(match[3]);
    const cellSize = parseFloat(stage.style.width) / GRID;
    return {
      clientX: panX + (x + 0.5) * cellSize * zoom,
      clientY: panY + (y + 0.5) * cellSize * zoom,
    };
  }

  function pointer(type: 'pointerdown' | 'pointerup', at: { clientX: number; clientY: number }): void {
    const main = container.querySelector('main');
    if (!main) throw new Error('中列没渲染出来');
    act(() => {
      main.dispatchEvent(
        new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...at }),
      );
    });
  }

  /** 点第 `index` 张名册卡进入放置态（游戏页是只读名册，抬手即选中）。 */
  function enterPlacing(index: number): void {
    const card = container.querySelector(`[data-slot-index="${index}"]`);
    if (!card) throw new Error(`名册第 ${index} 张卡没渲染出来`);
    act(() => {
      card.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 }));
    });
  }

  function ring(): Element | null {
    return container.querySelector('.press-ring-arc');
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

  /** 让真实定时器跑过去，更新仍包在 act 里。 */
  async function wait(ms: number): Promise<void> {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, ms));
    });
  }

  it('按下格子出现进度环，抬手就收', () => {
    render();
    sizeCanvas();
    enterPlacing(0);

    const at = cellCenter(4, 4);
    pointer('pointerdown', at);
    expect(ring()).not.toBeNull();

    pointer('pointerup', at);
    expect(ring()).toBeNull();
  });

  it('按住到 500ms 头像落下，环留到抬手才收', async () => {
    render();
    sizeCanvas();
    enterPlacing(0);

    const at = cellCenter(4, 4);
    pointer('pointerdown', at);
    expect(container.querySelector('.place-settle')).toBeNull();

    await wait(560);

    // 落下的头像带一次落定动效（v0.7.11），环还在 —— 满环与动作是同一刻。
    expect(container.querySelector('.place-settle')).not.toBeNull();
    expect(ring()).not.toBeNull();

    pointer('pointerup', at);
    expect(ring()).toBeNull();
    // 抬手后窗口关闭，落定标记撤掉（头像本身留在棋盘上）。
    expect(container.querySelector('.place-settle')).toBeNull();
  });

  it('被规则拒绝时环立刻收回，不留下一个满环冒充「放好了」', async () => {
    // 参与者 1 的头像已经站在 (0,0) —— 换一格长按会被唯一性挡下。
    seedSave({ board: { '0,0': { kind: 'participant', index: 1 } } });
    render();
    sizeCanvas();
    enterPlacing(0);

    const at = cellCenter(4, 4);
    pointer('pointerdown', at);
    expect(ring()).not.toBeNull();

    await wait(560);

    expect(ring()).toBeNull();
    expect(container.querySelector('.place-settle')).toBeNull();
    expect(toasts.errors.length).toBeGreaterThan(0);
  });

  it('清除按钮的长按画的是同一圈环', () => {
    render();
    sizeCanvas();

    const button = Array.from(container.querySelectorAll('button')).find((node) =>
      node.getAttribute('title')?.startsWith('清除工具'),
    );
    if (!button) throw new Error('清除按钮没渲染出来');

    act(() => {
      button.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
    });
    expect(ring()).not.toBeNull();

    act(() => {
      button.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 }));
    });
    expect(ring()).toBeNull();
  });
});
