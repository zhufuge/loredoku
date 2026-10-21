import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapGameSummary } from '@loredoku/shared';
import { DeploymentsPage } from './DeploymentsPage';

/**
 * 部署模块（v0.7.1 §7.4）：一行 = 一条在线游戏；取消部署走二次确认，弹窗里
 * 明写「玩家立刻无法访问 / 同一路径可以再用」两件事。
 */
const gamesRef: { data: MapGameSummary[]; isLoading: boolean; isError: boolean } = {
  data: [],
  isLoading: false,
  isError: false,
};
const cancelMutate = vi.fn();

vi.mock('@/hooks/useGames', () => ({
  useGames: () => ({ ...gamesRef, refetch: () => {} }),
  useCancelGame: () => ({ mutate: cancelMutate, isPending: false }),
}));

function game(overrides: Partial<MapGameSummary> = {}): MapGameSummary {
  return {
    id: 3,
    puzzleId: 9,
    puzzleName: '午夜花园',
    puzzleVersionNo: 2,
    name: '午夜花园',
    slug: 'puzzle-midnight-garden-medium',
    coverUrl: null,
    difficulty: 'medium',
    gridSize: 6,
    participantCount: 6,
    createdAt: '2026-01-04T00:00:00.000Z',
    ...overrides,
  };
}

describe('DeploymentsPage (v0.7.1 §7.4)', () => {
  let container: HTMLDivElement;
  let root: Root;

  function render(): void {
    act(() => {
      root.render(
        <MemoryRouter>
          <DeploymentsPage />
        </MemoryRouter>,
      );
    });
  }

  /** 确认弹窗（Radix AlertDialog）portal 到 `document.body`，所以读整页文本。 */
  const text = (): string => document.body.textContent ?? '';

  const clickButton = (title: string): void => {
    const found = Array.from(container.ownerDocument.querySelectorAll<HTMLButtonElement>('button'))
      .find((node) => node.getAttribute('title') === title);
    act(() => found?.click());
  };

  beforeEach(() => {
    cancelMutate.mockClear();
    gamesRef.data = [game()];
    gamesRef.isLoading = false;
    gamesRef.isError = false;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('一行里给出游戏名、来源谜题版本、难度、尺寸与访问路径', () => {
    render();
    expect(text()).toContain('午夜花园');
    expect(text()).toContain('来源：午夜花园 v2');
    expect(text()).toContain('6 × 6');
    expect(text()).toContain('/play/puzzle-midnight-garden-medium');
    expect(text()).toContain('共 1 个游戏在线。');
  });

  it('「打开游戏」是新标签页链接，不抢作者当前的列表页签', () => {
    render();
    const link = container.querySelector<HTMLAnchorElement>('a[title="在新标签页打开游戏"]');
    expect(link?.getAttribute('href')).toBe('/play/puzzle-midnight-garden-medium');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toBe('noreferrer');
  });

  it('取消部署要二次确认，且写明链接立刻失效、路径可以再用', () => {
    render();
    clickButton('取消部署');
    expect(text()).toContain('玩家通过 /play/puzzle-midnight-garden-medium 将立即无法访问');
    expect(text()).toContain('可以再用同一个访问路径重新部署');
    // 还没确认，不发请求。
    expect(cancelMutate).not.toHaveBeenCalled();
  });

  it('空态给一个「前往谜题列表」的出口', () => {
    gamesRef.data = [];
    render();
    expect(text()).toContain('还没有部署任何游戏');
    expect(
      Array.from(container.querySelectorAll('button')).some((node) =>
        node.textContent?.includes('前往谜题列表'),
      ),
    ).toBe(true);
  });
});
