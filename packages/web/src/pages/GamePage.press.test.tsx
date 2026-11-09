import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { GAME_ACTIVE_PARTICIPANT_AVATAR_SCALE } from '@loredoku/shared';
import { installMatchMedia, type MatchMediaStub } from '@/testing/matchMedia';
import { GAME_PROGRESS_VERSION, gameProgressKey } from '@/lib/gameProgress';
import ApiGamePage from './ApiGamePage';

/**
 * v0.7.11：长按的过程可见化 + 按住滑动连续操作。
 *
 * 棋格上按住 500ms 放头像（SPEC-J02）、清除按钮上按住 500ms 清空全部
 * （SPEC-G04）—— 这两个手势此前只有结果、没有过程。这一轮给它们同一圈进度环，
 * 并且环**延迟 160ms** 才出现：单点根本不会长按，之前它却会在按下的第一帧就闪
 * 出来，那是在预告一件不会发生的事。
 *
 * 页面级只钉这些**能看见的事**：
 *   1. 单点不闪环；按住过了 160ms，环才出现；抬手，环消失；
 *   2. 按住到 500ms，头像落下（带落定动效）而环留到抬手；
 *   3. 被规则拒绝时环立刻收回 —— 不能让一个满环停在那里冒充「放好了」；
 *   4. 清除按钮的长按画的是同一圈环，不是另一套；
 *   5. 按住滑过的格子都会落笔（放置 / 擦除），且抬手那一记 click 不会把最后一格
 *      再切换一次。
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
}));
vi.mock('@/hooks/useAssets', () => ({ useAssets: () => ({ data: [] }) }));
/**
 * v0.8.0 §16.6：从合辑进来时左栏要显示主题名。这套测试没有
 * `QueryClientProvider`（也不需要），所以把它 mock 成「没有合辑上下文」——
 * 也就是单局入口那条路径，返回入口根本不该出现。
 */
vi.mock('@/hooks/useThemes', () => ({
  useThemeDeploymentBySlug: () => ({ data: undefined }),
  // v0.8.7 §4：禁止符号「谜题 → 主题 → ×」的第二档。这一套不测它，返回「主题没配」。
  useForbiddenSymbolByCode: () => () => null,
  // v0.8.7 §7：这一套不测工具图标，主题那一套一律当作「没配」。
  useToolIconsByCode: () => () => null,
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
    if (!button) throw new Error('禁止符号按钮没渲染出来');
    act(() => button.click());
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

  it('单点不闪环，按住过了延迟才出现（v0.7.11）', async () => {
    render();
    sizeCanvas();
    enterPlacing(0);

    const at = cellCenter(4, 4);
    pointer('pointerdown', at);
    // 按下那一刻什么都不该出现：单点的抬手往往比 160ms 还早。
    expect(ring()).toBeNull();

    await wait(200);
    expect(ring()).not.toBeNull();

    pointer('pointerup', at);
    expect(ring()).toBeNull();
  });

  it('按一下就抬手，整段手势都不出现环', async () => {
    render();
    sizeCanvas();
    enterPlacing(0);

    const at = cellCenter(4, 4);
    pointer('pointerdown', at);
    pointer('pointerup', at);
    await wait(220);
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

  /**
   * v0.8.7：头像落下 = 这一手做完了 —— 名册那张卡不能继续留在「触碰态」。
   *
   * 原先只把 `mode` 收回 `idle`（选中那道 3px 边退掉了），`activation` 还停在
   * `click` 上：卡片外面那道 2px 主色环、棋盘上这位参与者的联动高亮、以及
   * `activeParticipantId` 带来的 1.3× 放大头像，一起留在了屏幕上。头像已经落定，
   * 界面却还在说「这位正被拿着」。
   *
   * 短按（放编号）不在此列：那位参与者确实还在手上，卡片该亮着 —— 见下一条。
   */
  it('头像落下之后，名册卡不再留在触碰态（v0.8.7）', async () => {
    render();
    sizeCanvas();
    enterPlacing(0);

    const card = (): HTMLElement => {
      const node = container.querySelector<HTMLElement>('[data-slot-index="0"]');
      if (!node) throw new Error('名册第一张卡没渲染出来');
      return node;
    };

    // 点卡之后是「拿着」：选中那道边 + 主题色铺开。
    expect(card().style.boxShadow).toContain('--primary');
    expect(card().getAttribute('data-tint')).toBe('on');

    const at = cellCenter(4, 4);
    pointer('pointerdown', at);
    await wait(560);
    pointer('pointerup', at);

    // 头像落下：环与铺色一起退掉，棋盘上也找不到被放大的头像。
    expect(card().style.boxShadow).toBe('');
    expect(card().getAttribute('data-tint')).toBeNull();
    const magnified = `main [style*="scale(${GAME_ACTIVE_PARTICIPANT_AVATAR_SCALE})"]`;
    expect(container.querySelector(magnified)).toBeNull();
  });

  /**
   * 同一件事的另一半：短按落的是**编号（草稿）**，这位参与者仍然拿在手上 ——
   * 卡片该继续亮着。`modeAfterPlacement` 只对头像把模式收回 `idle`，所以
   * 「退触碰态」也只发生在头像那一路。
   */
  it('短按只放编号：名册卡还亮着（v0.8.7）', () => {
    render();
    sizeCanvas();
    enterPlacing(0);

    const at = cellCenter(4, 4);
    pointer('pointerdown', at);
    pointer('pointerup', at);
    clickAt(at);

    const card = container.querySelector<HTMLElement>('[data-slot-index="0"]');
    expect(card?.style.boxShadow).toContain('--primary');
    expect(card?.getAttribute('data-tint')).toBe('on');
  });

  /**
   * v0.7.12（「不能站立的格子和禁止符号在的格子，选参与者长按时，不出现圆圈，
   * 不提示，就是无效果」）。
   *
   * 前两版是「环先照画，被规则拒绝时再收回」。问题是环画满的那一刻，玩家看到的
   * 是「按成功了」—— 收回去只是补救。现在按下的一刻就知道这一格放不进去，于是
   * 整段手势根本不开始：没有环、没有 toast、棋盘一格不动。
   */
  it('在 × 格上长按：不出现圆环、不提示，也不落下任何东西', async () => {
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
  });

  /**
   * 同一格上的**短按**也该是安静的：`×` 格在放置态下点击无效果、也无提示
   * （v0.7.12）—— 悬停时提示层都已经不画那个编号了。
   */
  it('在 × 格上点编号：无效果，也不弹提示', () => {
    seedSave({ board: { '4,4': { kind: 'forbidden' } } });
    render();
    sizeCanvas();
    enterPlacing(0);

    clickAt(cellCenter(4, 4));

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

  it('按住清除橡皮擦滑过的格子一起清掉', () => {
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
    // 短按 = 切换成清除工具（长按才是清空全部）—— 两个事件都要给，缺一个就当长按。
    act(() => {
      eraser.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
      eraser.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 }));
    });

    pointer('pointerdown', cellCenter(0, 0));
    pointer('pointermove', cellCenter(1, 0));
    pointer('pointermove', cellCenter(2, 0));
    pointer('pointerup', cellCenter(2, 0));
    clickAt(cellCenter(2, 0));

    expect(savedBoard()).toEqual({});
  });

  /**
   * v0.7.12（「禁止符号点已经放置了禁止符号的格子时，清空该格子的禁止符号」）。
   *
   * `×` 从此是一支开关。此前这一下什么都不做，撤销一个点错的 `×` 要切到橡皮
   * 擦掉整格、再切回来 —— 两次工具切换只为了一个单格动作。
   */
  it('× 工具点已有的 ×：把那一格的 × 收回', () => {
    seedSave({ board: { '4,4': { kind: 'forbidden' } } });
    render();
    sizeCanvas();
    enterForbidden();

    clickAt(cellCenter(4, 4));

    // 空盘 —— 收回之后存档把整条键都删了。
    expect(savedBoard()).toEqual({});
    // v0.9.0 §17：右下角「可回退 M 步」删了，改用按钮本身验「收回是一步历史」：
    // 撤回按钮点亮 → 点一下 → 那枚 × 回到棋盘。比读一行数字更直接。
    const undo = container.querySelector<HTMLButtonElement>('button[title="回退上一步"]');
    expect(undo).not.toBeNull();
    expect(undo?.disabled).toBe(false);
    act(() => undo?.click());
    expect(savedBoard()['4,4']).toEqual({ kind: 'forbidden' });
  });

  /**
   * 滑动也走同一条开关：按住划过的 `×` 格一起收回，与「划过的格子执行对应
   * 点击」是同一句话。
   */
  it('按住划过几格 ×：划过的都收回', () => {
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

    pointer('pointerdown', cellCenter(3, 4));
    pointer('pointermove', cellCenter(4, 4));
    pointer('pointermove', cellCenter(5, 4));
    pointer('pointerup', cellCenter(5, 4));
    // 抬手后浏览器补的那记 click 是这一笔的尾巴，不能再反着放一个 × 回去。
    clickAt(cellCenter(5, 4));

    expect(savedBoard()).toEqual({});
  });

  /** 空格上照旧放下一个 × —— 开关的另一半。 */
  it('空格上仍然放上一个 ×', () => {
    render();
    sizeCanvas();
    enterForbidden();

    clickAt(cellCenter(2, 2));

    expect(savedBoard()).toEqual({ '2,2': { kind: 'forbidden' } });
  });

  it('清除按钮的长按画的是同一圈环', async () => {
    render();
    sizeCanvas();

    const button = Array.from(container.querySelectorAll('button')).find((node) =>
      node.getAttribute('title')?.startsWith('清除放置'),
    );
    if (!button) throw new Error('清除按钮没渲染出来');

    act(() => {
      button.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
    });
    // 与棋格同一个延迟 —— 单点只是切换工具，不该闪一圈。
    expect(ring()).toBeNull();

    await wait(200);
    expect(ring()).not.toBeNull();

    act(() => {
      button.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 }));
    });
    expect(ring()).toBeNull();
  });
});
