import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameSlugConflict, MapGameSummary, PuzzleEntrySummary } from '@loredoku/shared';
import { GameDeployDialog } from './GameDeployDialog';

/**
 * 部署弹窗的访问路径输入组（v0.7.1 §7.6.1）。
 *
 * 路径拆成「只读前缀 `puzzle-` + 可编辑中段」：中段是唯一可编辑的部分。
 * v0.8.1：难度不进路径 —— 改难度不改地址；已部署过的游戏回填时反解出中段
 * （存量路径的难度后缀被剥掉），改掉之后明写「原访问路径将失效」。
 *
 * Radix 把面板 portal 到 `document.body`，所以查询走 `document`。
 */
const deployMutate = vi.fn();
/** 弹窗交给 hook 的冲突回调 —— 测试里手动触发一次「路径被占」。 */
const hook = vi.hoisted(() => ({
  onSlugConflict: undefined as ((conflict: GameSlugConflict) => void) | undefined,
}));

vi.mock('@/hooks/useGames', () => ({
  useDeployGame: (options?: { onSlugConflict?: (conflict: GameSlugConflict) => void }) => {
    hook.onSlugConflict = options?.onSlugConflict;
    return { mutate: deployMutate, isPending: false };
  },
}));

function puzzle(overrides: Partial<PuzzleEntrySummary> = {}): PuzzleEntrySummary {
  return {
    id: 9,
    kind: 'version',
    rootId: 9,
    versionNo: 2,
    name: 'Midnight Garden',
    description: null,
    code: null,
    gridSize: 6,
    mapId: 217,
    mapName: 'Old Castle',
    mapVersionNo: 3,
    coverPath: null,
    coverUrl: null,
    currentVersionNo: 2,
    versionCount: 2,
    publishedAt: '2026-01-03T00:00:00.000Z',
    deployed: false,
    createdAt: '2026-01-03T00:00:00.000Z',
    updatedAt: '2026-01-03T00:00:00.000Z',
    ...overrides,
  };
}

function existingGame(overrides: Partial<MapGameSummary> = {}): MapGameSummary {
  return {
    id: 3,
    puzzleId: 9,
    themeCode: 'default',
    puzzleName: 'Midnight Garden',
    puzzleVersionNo: 2,
    name: 'Midnight Garden',
    slug: 'puzzle-night-train-easy',
    coverUrl: null,
    difficulty: 'easy',
    sortWeight: 0,
    gridSize: 6,
    participantCount: 6,
    createdAt: '2026-01-04T00:00:00.000Z',
    ...overrides,
  };
}

describe('GameDeployDialog (v0.7.1 §7.6.1)', () => {
  let container: HTMLDivElement;
  let root: Root;

  function render(props: {
    puzzle: PuzzleEntrySummary | null;
    existingGame?: MapGameSummary | null;
  }): void {
    act(() => {
      root.render(
        <GameDeployDialog
          puzzle={props.puzzle}
          existingGame={props.existingGame ?? null}
          open
          onOpenChange={() => {}}
        />,
      );
    });
  }

  const middleInput = (): HTMLInputElement =>
    document.querySelector<HTMLInputElement>('#game-deploy-slug') as HTMLInputElement;

  const text = (): string => document.body.textContent ?? '';

  const sortInput = (): HTMLInputElement =>
    document.querySelector<HTMLInputElement>('#game-deploy-sort') as HTMLInputElement;

  const setSort = (value: string): void => {
    const input = sortInput();
    const setter = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(input),
      'value',
    )?.set;
    act(() => {
      setter?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

  const clickButton = (label: string): void => {
    const found = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
      (node) => node.textContent?.trim() === label || node.getAttribute('title') === label,
    );
    act(() => found?.click());
  };

  const setMiddle = (value: string): void => {
    const input = middleInput();
    const setter = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(input),
      'value',
    )?.set;
    act(() => {
      setter?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

  beforeEach(() => {
    deployMutate.mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('前缀是只读文本，中段默认取名称的 slug，路径没有难度后缀', () => {
    render({ puzzle: puzzle() });
    expect(text()).toContain('puzzle-');
    expect(middleInput().value).toBe('midnight-garden');
    // 默认路径不带版本号 —— 路径是对外公布的，不掺内部实现细节。
    expect(middleInput().value).not.toContain('2');
    expect(text()).toContain('/play/puzzle-midnight-garden');
    expect(text()).not.toContain('-medium');
  });

  /**
   * v0.8.5 §7.4：中段默认值来自**谜题编码**（作者建谜题时写的那一串），没有编码的
   * 存量谜题才退回名称 —— 上一条测的正是退回那一路。
   */
  it('中段默认取谜题编码，改名不跟着变', () => {
    render({ puzzle: puzzle({ code: 'hlm-sishan' }) });
    expect(middleInput().value).toBe('hlm-sishan');

    const nameInput = document.querySelector<HTMLInputElement>('#game-deploy-name')!;
    const setter = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(nameInput),
      'value',
    )?.set;
    act(() => {
      setter?.call(nameInput, '另一个名字');
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // 编码定地址 —— 改名只改显示名，链接不能被带走。
    expect(middleInput().value).toBe('hlm-sishan');
    expect(text()).toContain('/play/puzzle-hlm-sishan');
  });

  it('改难度不改预览路径（v0.8.1：难度是属性，不是地址）', () => {
    render({ puzzle: puzzle() });
    clickButton('Hard');
    expect(text()).toContain('/play/puzzle-midnight-garden');
  });

  it('中段可改，预览行同步', () => {
    render({ puzzle: puzzle() });
    setMiddle('flower-garden');
    expect(text()).toContain('/play/puzzle-flower-garden');
  });

  it('已部署的游戏回填时把中段反解出来', () => {
    render({ puzzle: puzzle(), existingGame: existingGame() });
    expect(middleInput().value).toBe('night-train');
  });

  it('存量路径（带难度后缀）重新部署时明写「原访问路径将失效」', () => {
    render({ puzzle: puzzle(), existingGame: existingGame() });
    // v0.8.1：存量路径 `puzzle-night-train-easy` 的后缀被剥掉，新路径是
    // `puzzle-night-train` —— 从弹窗打开那一刻起旧链接就要失效，明说。
    expect(text()).toContain('原访问路径 /play/puzzle-night-train-easy 将失效');
    setMiddle('night-train-2');
    expect(text()).toContain('原访问路径 /play/puzzle-night-train-easy 将失效');
  });

  it('新路径（无难度后缀）重新部署时不说「将失效」', () => {
    render({
      puzzle: puzzle(),
      existingGame: existingGame({ slug: 'puzzle-night-train' }),
    });
    expect(text()).not.toContain('将失效');
    setMiddle('night-train-2');
    expect(text()).toContain('原访问路径 /play/puzzle-night-train 将失效');
  });

  it('中段为空不提交（空着拼出来是光杆 puzzle，看着合法其实丢了名称）', () => {
    render({ puzzle: puzzle() });
    setMiddle('');
    clickButton('部署');
    expect(deployMutate).not.toHaveBeenCalled();
    expect(text()).toContain('请填写访问路径');
  });

  it('提交时把前缀与中段拼成一条 slug 交出去', () => {
    render({ puzzle: puzzle() });
    setMiddle('flower-garden');
    clickButton('部署');
    expect(deployMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        puzzleId: 9,
        slug: 'puzzle-flower-garden',
        difficulty: 'medium',
      }),
      expect.anything(),
    );
  });

  /**
   * v0.8.3：顺序（`sort_weight`）。三种提交语义分别测 —— 回填、清空、越界。
   * 「清空」那条最要紧：它必须是「这次不提」，而不是「就排 0」，否则重新部署
   * 会把作者排好的先后冲掉。
   */
  it('重新部署时回填那条部署自己的顺序', () => {
    render({ puzzle: puzzle(), existingGame: existingGame({ sortWeight: -3 }) });
    expect(sortInput().value).toBe('-3');
  });

  it('第一次部署时顺序默认 0', () => {
    render({ puzzle: puzzle() });
    expect(sortInput().value).toBe('0');
  });

  it('清空顺序 = 这次不提（不把 0 发出去）', () => {
    render({ puzzle: puzzle(), existingGame: existingGame({ sortWeight: 4 }) });
    setSort('');
    clickButton('部署');
    const payload = deployMutate.mock.calls[0]?.[0] as Record<string, unknown>;
    expect('sortWeight' in payload).toBe(false);
  });

  it('填了顺序就原样交出去', () => {
    render({ puzzle: puzzle() });
    setSort('12');
    clickButton('部署');
    expect(deployMutate).toHaveBeenCalledWith(
      expect.objectContaining({ sortWeight: 12 }),
      expect.anything(),
    );
  });

  it('越界的顺序被拦住，不发请求', () => {
    render({ puzzle: puzzle() });
    setSort('1000');
    clickButton('部署');
    expect(deployMutate).not.toHaveBeenCalled();
    expect(text()).toContain('顺序需为 -999 到 999 之间的整数');
  });

  it('谜题有封面时默认用它（v0.7.2 §4）', () => {
    render({ puzzle: puzzle({ coverUrl: 'https://cdn.test/puzzle.webp' }) });
    const shown = document.querySelector<HTMLImageElement>('img[alt="当前封面"]');
    expect(shown?.getAttribute('src')).toBe('https://cdn.test/puzzle.webp');
    expect(text()).toContain('默认使用谜题封面，可替换。');

    clickButton('部署');
    expect(deployMutate).toHaveBeenCalledWith(
      expect.objectContaining({ coverFromPuzzleUrl: 'https://cdn.test/puzzle.webp' }),
      expect.anything(),
    );
  });

  it('重新部署时优先用游戏自己的封面，不拿谜题封面顶掉它', () => {
    render({
      puzzle: puzzle({ coverUrl: 'https://cdn.test/puzzle.webp' }),
      existingGame: existingGame({ coverUrl: 'https://cdn.test/game.webp' }),
    });
    expect(
      document.querySelector<HTMLImageElement>('img[alt="当前封面"]')?.getAttribute('src'),
    ).toBe('https://cdn.test/game.webp');
    expect(text()).toContain('当前为该游戏已上传的封面。');

    clickButton('部署');
    expect(deployMutate).toHaveBeenCalledWith(
      expect.objectContaining({ coverFromPuzzleUrl: null }),
      expect.anything(),
    );
  });

  it('谜题与游戏都没有封面时不传图', () => {
    render({ puzzle: puzzle() });
    clickButton('部署');
    expect(deployMutate).toHaveBeenCalledWith(
      expect.objectContaining({ coverFromPuzzleUrl: null }),
      expect.anything(),
    );
  });

  /**
   * v0.7.11：路径撞车不再只是「一句 toast 请更换」。弹窗问一次要不要**覆盖**，
   * 说清被占的是哪条路径、占位的是谁；确认后原样重发，只多一个 `overwriteSlug`。
   */
  it('路径被占时弹窗问「覆盖」，确认后原样重发并带上 overwriteSlug', () => {
    render({ puzzle: puzzle() });
    clickButton('部署');
    expect(deployMutate).toHaveBeenCalledTimes(1);

    act(() =>
      hook.onSlugConflict?.({
        kind: 'slug-taken',
        slug: 'puzzle-midnight-garden',
        name: '旧的那一个',
        puzzleName: '旧谜题',
      }),
    );
    expect(text()).toContain('访问路径已被占用');
    expect(text()).toContain('旧的那一个');

    clickButton('覆盖');
    expect(deployMutate).toHaveBeenCalledTimes(2);
    const [payload] = deployMutate.mock.calls[1] as [Record<string, unknown>];
    expect(payload).toMatchObject({
      puzzleId: 9,
      slug: 'puzzle-midnight-garden',
      overwriteSlug: true,
    });
  });
});
