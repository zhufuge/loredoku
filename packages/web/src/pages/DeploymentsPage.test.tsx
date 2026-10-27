import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapGameSummary, PuzzleEntrySummary } from '@loredoku/shared';
import { DeploymentsPage } from './DeploymentsPage';

/**
 * 部署模块（v0.7.1 §7.4）：一行 = 一条在线游戏；取消部署走二次确认，弹窗里
 * 明写「玩家立刻无法访问 / 同一路径可以再用」两件事。
 *
 * v0.7.11：这一页有了自己的「部署」按钮 —— 空状态里也是它。原先那个
 * 「前往谜题列表」的出口随之删掉：它唯一的用处是绕路去做同一件事。
 */
const gamesRef: { data: MapGameSummary[]; isLoading: boolean; isError: boolean } = {
  data: [],
  isLoading: false,
  isError: false,
};
const versionsRef: { data: { list: PuzzleEntrySummary[] } | undefined } = { data: { list: [] } };
const cancelMutate = vi.fn();
const deployMutate = vi.fn();

vi.mock('@/hooks/useGames', () => ({
  useGames: () => ({ ...gamesRef, refetch: () => {} }),
  useCancelGame: () => ({ mutate: cancelMutate, isPending: false }),
  // 部署弹窗也是这一页渲染的（默认关着），它得能拿到这个 hook。
  useDeployGame: () => ({ mutate: deployMutate, isPending: false }),
}));

vi.mock('@/hooks/usePuzzles', () => ({
  usePuzzles: () => ({ data: versionsRef.data, isLoading: false, isError: false }),
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

/** 一条**已发布的谜题版本行** —— 部署弹窗里可选的单位。 */
function version(overrides: Partial<PuzzleEntrySummary> = {}): PuzzleEntrySummary {
  return {
    id: 21,
    kind: 'version',
    rootId: 9,
    versionNo: 3,
    name: '海边的灯塔',
    description: null,
    gridSize: 6,
    mapId: 1,
    mapName: '灯塔',
    mapVersionNo: 2,
    coverPath: null,
    coverUrl: null,
    currentVersionNo: 3,
    versionCount: 3,
    publishedAt: '2026-01-03T00:00:00.000Z',
    deployed: false,
    createdAt: '2026-01-03T00:00:00.000Z',
    updatedAt: '2026-01-03T00:00:00.000Z',
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

  // v0.7.9 §5：图标按钮的唯一真源是 aria-label（提示由 Tooltip 呈现），定位随之改。
  const clickButton = (label: string): void => {
    const found = Array.from(container.ownerDocument.querySelectorAll<HTMLButtonElement>('button'))
      .find((node) => node.getAttribute('aria-label') === label);
    act(() => found?.click());
  };

  beforeEach(() => {
    cancelMutate.mockClear();
    deployMutate.mockClear();
    gamesRef.data = [game()];
    gamesRef.isLoading = false;
    gamesRef.isError = false;
    versionsRef.data = { list: [version()] };
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

  it('空态给一个「部署」的出口，而不是绕去谜题列表', () => {
    gamesRef.data = [];
    render();
    expect(text()).toContain('还没有部署任何游戏');
    const buttons = Array.from(container.querySelectorAll('button'));
    expect(buttons.some((node) => node.textContent?.trim() === '部署')).toBe(true);
    expect(buttons.some((node) => node.textContent?.includes('前往谜题列表'))).toBe(false);
  });

  it('页头也有「部署」按钮，点开就是部署弹窗（v0.7.11）', () => {
    render();
    const buttons = Array.from(container.querySelectorAll('button'));
    expect(buttons.some((node) => node.textContent?.includes('前往谜题列表'))).toBe(false);

    const deployButton = buttons.find((node) => node.textContent?.trim() === '部署');
    expect(deployButton).not.toBeUndefined();
    act(() => deployButton?.click());

    // 弹窗第一步就是选谜题版本。
    expect(text()).toContain('谜题版本');
    const select = document.querySelector<HTMLSelectElement>('#game-deploy-version');
    expect(select).not.toBeNull();
    expect(select?.options[1]?.textContent).toContain('海边的灯塔 v3');
  });

  it('选中谜题版本后，名称 / 路径都按这个版本回填（v0.7.11）', () => {
    render();
    act(() =>
      Array.from(container.querySelectorAll('button'))
        .find((node) => node.textContent?.trim() === '部署')
        ?.click(),
    );

    const nameInput = document.querySelector<HTMLInputElement>('#game-deploy-name');
    expect(nameInput?.value).toBe('');

    const select = document.querySelector<HTMLSelectElement>('#game-deploy-version');
    if (!select) throw new Error('版本下拉没渲染出来');
    act(() => {
      select.value = '21';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(document.querySelector<HTMLInputElement>('#game-deploy-name')?.value).toBe(
      '海边的灯塔',
    );
    // 中文名 slug 化之后什么都不剩，所以路径留给作者自己填 —— 与部署弹窗一贯的规则一致。
    expect(text()).toContain('无法根据名称生成访问路径');
  });
});
