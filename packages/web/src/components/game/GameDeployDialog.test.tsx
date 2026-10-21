import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapGameSummary, PuzzleEntrySummary } from '@loredoku/shared';
import { GameDeployDialog } from './GameDeployDialog';

/**
 * 部署弹窗的访问路径输入组（v0.7.1 §7.6.1）。
 *
 * 路径拆成「只读前缀 `puzzle-` + 可编辑中段 + 只读难度后缀」：中段是唯一可编辑
 * 的部分，难度**永远**实时参与拼接；已部署过的游戏回填时反解出中段，改掉之后
 * 明写「原访问路径将失效」。
 *
 * Radix 把面板 portal 到 `document.body`，所以查询走 `document`。
 */
const deployMutate = vi.fn();

vi.mock('@/hooks/useGames', () => ({
  useDeployGame: () => ({ mutate: deployMutate, isPending: false }),
}));

function puzzle(overrides: Partial<PuzzleEntrySummary> = {}): PuzzleEntrySummary {
  return {
    id: 9,
    kind: 'version',
    rootId: 9,
    versionNo: 2,
    name: 'Midnight Garden',
    description: null,
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
    puzzleName: 'Midnight Garden',
    puzzleVersionNo: 2,
    name: 'Midnight Garden',
    slug: 'puzzle-night-train-easy',
    coverUrl: null,
    difficulty: 'easy',
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

  it('前缀与难度后缀是只读文本，中段默认取名称的 slug', () => {
    render({ puzzle: puzzle() });
    expect(text()).toContain('puzzle-');
    expect(text()).toContain('-medium');
    expect(middleInput().value).toBe('midnight-garden');
    // 默认路径不带版本号 —— 路径是对外公布的，不掺内部实现细节。
    expect(middleInput().value).not.toContain('2');
    expect(text()).toContain('/play/puzzle-midnight-garden-medium');
  });

  it('改难度时后缀与预览路径实时跟着变', () => {
    render({ puzzle: puzzle() });
    clickButton('Hard');
    expect(text()).toContain('-hard');
    expect(text()).toContain('/play/puzzle-midnight-garden-hard');
  });

  it('中段可改，预览行同步', () => {
    render({ puzzle: puzzle() });
    setMiddle('flower-garden');
    expect(text()).toContain('/play/puzzle-flower-garden-medium');
  });

  it('已部署的游戏回填时把中段反解出来', () => {
    render({ puzzle: puzzle(), existingGame: existingGame() });
    expect(middleInput().value).toBe('night-train');
  });

  it('已部署的路径被改掉时明写「原访问路径将失效」', () => {
    render({ puzzle: puzzle(), existingGame: existingGame() });
    expect(text()).not.toContain('将失效');
    clickButton('Hard');
    expect(text()).toContain('原访问路径 /play/puzzle-night-train-easy 将失效');
  });

  it('中段为空不提交（中段空着拼出来会是 puzzle-medium，看着合法其实丢了名称）', () => {
    render({ puzzle: puzzle() });
    setMiddle('');
    clickButton('部署');
    expect(deployMutate).not.toHaveBeenCalled();
    expect(text()).toContain('请填写访问路径');
  });

  it('提交时把三段拼成一条 slug 交出去', () => {
    render({ puzzle: puzzle() });
    setMiddle('flower-garden');
    clickButton('部署');
    expect(deployMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        puzzleId: 9,
        slug: 'puzzle-flower-garden-medium',
        difficulty: 'medium',
      }),
      expect.anything(),
    );
  });
});
