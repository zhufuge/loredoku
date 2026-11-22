import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { GAME_ACTIVE_PARTICIPANT_AVATAR_SCALE } from '@loredoku/shared';
import { installMatchMedia, type MatchMediaStub } from '@/testing/matchMedia';
import { GAME_PROGRESS_VERSION, gameProgressKey } from '@/lib/gameProgress';
import ApiGamePage from './ApiGamePage';

/**
 * 长按（棋格 500ms 放头像 SPEC-J02、清除按钮 800ms v0.9.2 §3）与按住滑动：页面级只钉看得见的事 —— 单点不闪环、160ms 后环才出现、被规则拒绝立刻收回、清除按钮改画扇形（§5）、滑过的格子都落笔且抬手那记 click 不再切换最后一格。环与扇形的几何各自在 `ring.test.tsx` / `PressSweep.test.tsx`。
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
    difficulty: 2,
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
  /** `ApiGameSource.useCatalog()` 读的是同一个 `useGames()`。这一套不测「下一关」，给一份只含当前这一关的清单 —— 后面没有关卡，那枚按钮不出现。 */
  useGames: () => ({ data: [], isLoading: false, isError: false, error: null }),
}));
vi.mock('@/hooks/useAssets', () => ({ useAssets: () => ({ data: [] }) }));
vi.mock('@/hooks/useThemes', () => ({
  // v0.8.7 §4：标记「谜题 → 主题 → ×」的第二档。这一套不测它，返回「主题没配」。
  useMarkByCode: () => () => null,
  // v0.9.2 §2：计时环的图 —— 这一套不测它，主题当作「没配」。
  useRingByCode: () => () => null,
  // v0.9.3 §3：校验样式 —— 这一套不测它，主题当作「没配」。
  useCheckColorsByCode: () => () => null,
  // 结算卡的图标与标题 —— 这一套不测它，落回内置 🎉 +「解题成功」。
  useVerdictByCode: () => () => null,
  // v0.8.7 §7：这一套不测工具图标，主题那一套一律当作「没配」。
  useToolIconsByCode: () => () => null,
  // 标尺符号只由主题配置，这一套不测它 —— 落回出厂的 C / R。
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
            <Route path="/play/:slug" element={<ApiGamePage />} />
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

  /** 格子中心的**视口**坐标。画布层带着 `translate(pan) scale(zoom)`， 直接写死像素会在 fit 之后落到画布外面 —— 从真实变换里反推。 */
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

  function pointer(
    type: 'pointerdown' | 'pointerup' | 'pointermove',
    at: { clientX: number; clientY: number },
  ): void {
    const main = container.querySelector('main');
    if (!main) throw new Error('中列没渲染出来');
    act(() => {
      main.dispatchEvent(
        new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...at }),
      );
    });
  }

  /** 抬手之后浏览器还会补一记 click —— 按住滑动时会多触发一次「尾巴」。 */
  function clickAt(at: { clientX: number; clientY: number }): void {
    const main = container.querySelector('main');
    if (!main) throw new Error('中列没渲染出来');
    act(() => {
      main.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...at }));
    });
  }

  /** 存档里的棋盘，按 `格子键 → 内容` 摊平，方便数「划过了几格」。 */
  function savedBoard(): Record<string, unknown> {
    const raw = window.localStorage.getItem(gameProgressKey('night-train'));
    if (!raw) return {};
    return (JSON.parse(raw) as { board?: Record<string, unknown> }).board ?? {};
  }

  /** 点第 `index` 张名册卡进入放置态（游戏页是只读名册，抬手即选中）。 */
  function enterPlacing(index: number): void {
    const card = container.querySelector(`[data-slot-index="${index}"]`);
    if (!card) throw new Error(`名册第 ${index} 张卡没渲染出来`);
    act(() => {
      card.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 }));
    });
  }

  /** 切到 `×` 工具（工具栏第二组里那个红叉按钮）。 */
  function enterForbidden(): void {
    const button = container.querySelector<HTMLButtonElement>('button[title="标记"]');
    if (!button) throw new Error('标记按钮没渲染出来');
    act(() => button.click());
  }

  function ring(): Element | null {
    return container.querySelector('.press-ring-arc');
  }

  /** v0.9.2 §5：清除按钮长按时那块扇形（按钮自己的进度反馈，不是棋格那圈环）。 */
  function sweep(): Element | null {
    return container.querySelector('.press-sweep');
  }

  /** 标记态悬停预览那枚 `×` 身上挂的动效类（两支轮换，统一取「有没有」）。 */
  function popClass(): string | null {
    const node = container.querySelector('.forbidden-pop, .forbidden-pop-alt');
    return node ? node.getAttribute('class') : null;
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

  /** 让真实定时器跑过去，更新仍包在 act 里。 */
  async function wait(ms: number): Promise<void> {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, ms));
    });
  }

  it('单点/按下就抬手不闪环，按住过了延迟才出现、抬手即收（v0.7.11）', async () => {
    render();
    sizeCanvas();
    enterPlacing(0);
    const at = cellCenter(4, 4);
    pointer('pointerdown', at);
    pointer('pointerup', at);
    await wait(220);
    expect(ring()).toBeNull();
    pointer('pointerdown', at);
    expect(ring()).toBeNull();
    await wait(200);
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
    expect(container.querySelector('.place-settle')).toBeNull();
  });

  /** 头像落下 = 这一手做完了，名册卡不能继续留在触碰态；短按落的是编号（草稿），参与者仍在手上，卡片该继续亮着。 */
  it('短按只放编号时名册卡仍亮着，头像落下后退出触碰态（v0.8.7）', async () => {
    render();
    sizeCanvas();
    enterPlacing(0);

    const card = (): HTMLElement => {
      const node = container.querySelector<HTMLElement>('[data-slot-index="0"]');
      if (!node) throw new Error('名册第一张卡没渲染出来');
      return node;
    };
    expect(card().style.boxShadow).toContain('--primary');
    expect(card().getAttribute('data-tint')).toBe('on');

    const tap = cellCenter(2, 2);
    pointer('pointerdown', tap);
    pointer('pointerup', tap);
    clickAt(tap);
    expect(card().style.boxShadow).toContain('--primary');
    expect(card().getAttribute('data-tint')).toBe('on');

    const at = cellCenter(4, 4);
    pointer('pointerdown', at);
    await wait(560);
    pointer('pointerup', at);
    expect(card().style.boxShadow).toBe('');
    expect(card().getAttribute('data-tint')).toBeNull();
    const magnified = `main [style*="scale(${GAME_ACTIVE_PARTICIPANT_AVATAR_SCALE})"]`;
    expect(container.querySelector(magnified)).toBeNull();
  });

  /** 需求：「不能站立的格子和标记在的格子，选参与者长按时，不出现圆圈，不提示，就是无效果」；同一格上的短按同样安静（v0.7.12）。 */
  it('在 × 格上长按或点编号：不出现圆环、不提示，也不落下任何东西', async () => {
    seedSave({ board: { '4,4': { kind: 'forbidden' } } });
    render();
    sizeCanvas();
    enterPlacing(0);

    const at = cellCenter(4, 4);
    pointer('pointerdown', at);
    await wait(220);
    expect(ring()).toBeNull();
    await wait(360);
    expect(ring()).toBeNull();
    expect(container.querySelector('.place-settle')).toBeNull();
    expect(toasts.errors).toHaveLength(0);
    expect(savedBoard()).toEqual({ '4,4': { kind: 'forbidden' } });
    pointer('pointerup', at);
    clickAt(at);
    expect(toasts.errors).toHaveLength(0);
    expect(savedBoard()).toEqual({ '4,4': { kind: 'forbidden' } });
  });

  it('按住滑过的格子都放上编号，抬手那一记 click 不会把最后一格再切换掉', () => {
    render();
    sizeCanvas();
    enterPlacing(0);
    pointer('pointerdown', cellCenter(1, 1));
    pointer('pointermove', cellCenter(2, 1));
    pointer('pointermove', cellCenter(3, 1));
    pointer('pointerup', cellCenter(3, 1));
    clickAt(cellCenter(3, 1));

    const board = savedBoard();
    expect(Object.keys(board).sort()).toEqual(['1,1', '2,1', '3,1']);
    expect(Object.values(board)).toEqual([
      { kind: 'numbers', entries: [1] },
      { kind: 'numbers', entries: [1] },
      { kind: 'numbers', entries: [1] },
    ]);
  });

  it('按住清除橡皮擦滑过的格子一起清掉', async () => {
    seedSave({
      board: {
        '0,0': { kind: 'participant', index: 1 },
        '1,0': { kind: 'numbers', entries: [2] },
        '2,0': { kind: 'numbers', entries: [3] },
      },
    });
    render();
    sizeCanvas();

    const eraser = Array.from(container.querySelectorAll('button')).find((node) =>
      node.getAttribute('title')?.startsWith('清除放置'),
    );
    if (!eraser) throw new Error('清除按钮没渲染出来');
    // 短按 = 切换成清除工具（长按才是清空全部），两个事件都要给。
    act(() => {
      eraser.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
      eraser.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 }));
    });
    pointer('pointerdown', cellCenter(0, 0));
    pointer('pointermove', cellCenter(1, 0));
    pointer('pointermove', cellCenter(2, 0));
    pointer('pointerup', cellCenter(2, 0));
    clickAt(cellCenter(2, 0));
    await wait(400);
    expect(savedBoard()).toEqual({});
  });

  it('橡皮点掉一格：先演退场，动效放完才从存档里删', async () => {
    seedSave({ board: { '4,4': { kind: 'numbers', entries: [2] } } });
    render();
    sizeCanvas();

    const eraser = Array.from(container.querySelectorAll('button')).find((node) =>
      node.getAttribute('title')?.startsWith('清除放置'),
    );
    if (!eraser) throw new Error('清除按钮没渲染出来');
    act(() => {
      eraser.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
      eraser.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 }));
    });
    clickAt(cellCenter(4, 4));
    // 退场进行中：棋盘上还留着，只是已经在淡出。
    expect(savedBoard()['4,4']).toEqual({ kind: 'numbers', entries: [2] });
    expect(container.querySelector('.erase-out')).not.toBeNull();
    await wait(400);
    expect(savedBoard()).toEqual({});
    expect(container.querySelector('.erase-out')).toBeNull();
  });

  it('橡皮点空格：什么都不发生', async () => {
    render();
    sizeCanvas();

    const eraser = Array.from(container.querySelectorAll('button')).find((node) =>
      node.getAttribute('title')?.startsWith('清除放置'),
    );
    if (!eraser) throw new Error('清除按钮没渲染出来');
    act(() => {
      eraser.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
      eraser.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 }));
    });
    clickAt(cellCenter(4, 4));
    expect(container.querySelector('.erase-out')).toBeNull();
    await wait(400);
    expect(savedBoard()).toEqual({});
  });

  it('× 工具：单击已有的 × 收回，按住划过则不再收回', () => {
    seedSave({
      board: {
        '3,4': { kind: 'forbidden' },
        '4,4': { kind: 'forbidden' },
        '5,4': { kind: 'forbidden' },
      },
    });
    render();
    sizeCanvas();
    enterForbidden();
    clickAt(cellCenter(4, 4));
    expect(savedBoard()).toEqual({
      '3,4': { kind: 'forbidden' },
      '5,4': { kind: 'forbidden' },
    });
    // v0.9.0 §17：用撤回按钮本身验「收回是一步历史」。
    const undo = container.querySelector<HTMLButtonElement>('button[title="回退上一步"]');
    expect(undo).not.toBeNull();
    expect(undo?.disabled).toBe(false);
    act(() => undo?.click());
    expect(savedBoard()['4,4']).toEqual({ kind: 'forbidden' });
    pointer('pointerdown', cellCenter(3, 4));
    pointer('pointermove', cellCenter(4, 4));
    pointer('pointermove', cellCenter(5, 4));
    pointer('pointerup', cellCenter(5, 4));
    // 抬手后浏览器补的那记 click 是这一笔的尾巴，不该被当成一次单击。
    clickAt(cellCenter(5, 4));
    expect(savedBoard()).toEqual({
      '3,4': { kind: 'forbidden' },
      '4,4': { kind: 'forbidden' },
      '5,4': { kind: 'forbidden' },
    });
  });

  it('笔画之后再单击同一格：照样把那一枚 × 收回', () => {
    seedSave({ board: { '4,4': { kind: 'forbidden' } } });
    render();
    sizeCanvas();
    enterForbidden();
    pointer('pointerdown', cellCenter(3, 4));
    pointer('pointermove', cellCenter(4, 4));
    pointer('pointerup', cellCenter(4, 4));
    clickAt(cellCenter(4, 4)); // 这一笔的尾巴
    // 笔画只加了空格 `3,4`，已有的 `4,4` 原样留着。
    expect(savedBoard()).toEqual({
      '3,4': { kind: 'forbidden' },
      '4,4': { kind: 'forbidden' },
    });
    clickAt(cellCenter(4, 4)); // 真正的单击
    expect(savedBoard()).toEqual({ '3,4': { kind: 'forbidden' } });
  });

  it('编号：单击已有自己编号的格子会取消，按住划回同一格则留着', () => {
    seedSave({ board: { '1,1': { kind: 'numbers', entries: [1] } } });
    render();
    sizeCanvas();
    enterPlacing(0);
    clickAt(cellCenter(1, 1));
    expect(savedBoard()).toEqual({});

    // 重新点上，再从 0,1 按住划回 1,1 到 2,1：划回不抹编号，前后的格子照常写上。
    clickAt(cellCenter(1, 1));
    pointer('pointerdown', cellCenter(0, 1));
    pointer('pointermove', cellCenter(1, 1));
    pointer('pointermove', cellCenter(2, 1));
    pointer('pointerup', cellCenter(2, 1));
    clickAt(cellCenter(2, 1)); // 这一笔的尾巴
    expect(savedBoard()).toEqual({
      '0,1': { kind: 'numbers', entries: [1] },
      '1,1': { kind: 'numbers', entries: [1] },
      '2,1': { kind: 'numbers', entries: [1] },
    });
  });

  it('空格上仍然放上一个 ×', () => {
    render();
    sizeCanvas();
    enterForbidden();
    clickAt(cellCenter(2, 2));
    expect(savedBoard()).toEqual({ '2,2': { kind: 'forbidden' } });
  });

  /** 清除按钮的长按不再画环，改成按钮方块内的扇形扫描；「清空全部」的阈值（800ms）比棋格（500ms）长 —— 放错一位撤销一步就回来，清空是整盘抹掉。 */
  it('清空全部按 800ms 才算，比棋格的 500ms 长', async () => {
    seedSave({ board: { '0,0': { kind: 'participant', index: 1 } } });
    render();
    sizeCanvas();

    const button = Array.from(container.querySelectorAll('button')).find((node) =>
      node.getAttribute('title')?.startsWith('清除放置'),
    );
    if (!button) throw new Error('清除按钮没渲染出来');

    act(() => {
      button.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
    });

    // 棋格在这一刻早就落子了；清空必须还没发生，扇形还在扫。
    await wait(560);
    expect(savedBoard()).toEqual({ '0,0': { kind: 'participant', index: 1 } });
    expect(sweep()).not.toBeNull();
    await wait(320);
    expect(savedBoard()).toEqual({});
    // 清的那一刻扇形已经收掉，不能停在满格上冒充还在按。
    expect(sweep()).toBeNull();

    act(() => {
      button.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 }));
    });
  });

  it('清除按钮的长按在方块里扫出一个扇形', async () => {
    render();
    sizeCanvas();

    const button = Array.from(container.querySelectorAll('button')).find((node) =>
      node.getAttribute('title')?.startsWith('清除放置'),
    );
    if (!button) throw new Error('清除按钮没渲染出来');

    act(() => {
      button.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
    });
    // 与棋格同一个延迟 —— 单点只是切换工具，不该闪一下；环也不该被顺手画出来。
    expect(sweep()).toBeNull();
    expect(ring()).toBeNull();
    await wait(200);
    expect(sweep()).not.toBeNull();
    expect(ring()).toBeNull();

    act(() => {
      button.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 }));
    });
    expect(sweep()).toBeNull();
  });

  it('标记态：指针移进方格不演动效，点下去放置才弹一次', async () => {
    render();
    sizeCanvas();
    enterForbidden();
    pointer('pointermove', cellCenter(2, 2));
    expect(popClass()).toBeNull();
    pointer('pointermove', cellCenter(3, 2));
    expect(popClass()).toBeNull();

    const at = cellCenter(2, 2);
    pointer('pointermove', at);
    clickAt(at);
    expect(savedBoard()).toEqual({ '2,2': { kind: 'forbidden' } });
    expect(popClass()).not.toBeNull();

    // 窗口关上之后类退掉，否则指针再进来时新元素一挂载就带着类又演一遍。
    await wait(500);
    expect(popClass()).toBeNull();
    pointer('pointermove', cellCenter(4, 2));
    expect(popClass()).toBeNull();
  });

  it('标记态：落笔后立刻挪到隔壁格，隔壁不弹', () => {
    render();
    sizeCanvas();
    enterForbidden();
    pointer('pointermove', cellCenter(2, 2));
    clickAt(cellCenter(2, 2));
    pointer('pointermove', cellCenter(3, 2));
    expect(savedBoard()).toEqual({ '2,2': { kind: 'forbidden' } });
    expect(popClass()).toBeNull();
  });

  /** 放下头像时补出的 × 按环号递增延迟依次浮现（水波纹）；这一遍演完类会退掉。 */
  function waveCells(): Array<{ key: string; delay: string; className: string }> {
    return Array.from(container.querySelectorAll<HTMLElement>('[data-testid^="forbidden-"]'))
      .map((node) => ({
        key: node.getAttribute('data-testid') ?? '',
        delay: node.style.animationDelay,
        className: node.getAttribute('class') ?? '',
      }))
      .filter((cell) => cell.className.includes('forbidden-wave'));
  }

  it('放下头像：补出的 × 按远近依次入场，演完退掉类', async () => {
    render();
    sizeCanvas();
    enterPlacing(0);

    const at = cellCenter(4, 4);
    pointer('pointerdown', at);
    await wait(560);
    pointer('pointerup', at);

    const waves = waveCells();
    // 9×9 的棋盘，放 (4,4)：整行剩 8 格、整列剩 8 格。
    expect(waves.length).toBe(16);
    const delays = waves.map((cell) => Number.parseFloat(cell.delay));
    expect(Math.min(...delays)).toBe(45);
    expect(Math.max(...delays)).toBe(180);
    // 两个环之间必须错开，否则一起出现就只是「同时亮了」。
    expect(new Set(delays).size).toBe(4);

    // 类要退干净：留着它，下一次落子会让老 × 也重演一遍。
    await wait(1300);
    expect(waveCells()).toHaveLength(0);
  });

  it('短按放编号：不补 ×，也就没有水波纹', async () => {
    render();
    sizeCanvas();
    enterPlacing(0);

    const at = cellCenter(4, 4);
    pointer('pointerdown', at);
    pointer('pointerup', at);
    clickAt(at);
    expect(waveCells()).toHaveLength(0);
  });
});
