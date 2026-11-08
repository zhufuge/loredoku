import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  MapGameSummary,
  PuzzleEntrySummary,
  Theme,
  ThemeDeploymentSummary,
} from '@loredoku/shared';
import { DeploymentsPage } from './DeploymentsPage';

/**
 * 部署模块（v0.7.1 §7.4）：一行 = 一条在线的东西；取消部署走二次确认，弹窗里
 * 明写「玩家立刻无法访问 / 同一路径可以再用」两件事。
 *
 * v0.8.1：列表恢复 v0.8 之前的**平铺**样式 —— 合辑一段、单局一段，一张卡；
 * 「导出包」挪到页头（它是主题级动作）。工作空间里只列当前主题的行。
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
const weightMutate = vi.fn();

vi.mock('@/hooks/useGames', () => ({
  useGames: () => ({ ...gamesRef, refetch: () => {} }),
  useCancelGame: () => ({ mutate: cancelMutate, isPending: false }),
  // 部署弹窗也是这一页渲染的（默认关着），它得能拿到这个 hook。
  useDeployGame: () => ({ mutate: deployMutate, isPending: false }),
  // v0.8.5：顺序列的就地编辑。
  useUpdateGameWeight: () => ({
    mutate: weightMutate,
    isPending: false,
    variables: undefined,
  }),
}));

vi.mock('@/hooks/usePuzzles', () => ({
  usePuzzles: () => ({ data: versionsRef.data, isLoading: false, isError: false }),
}));

/**
 * 合辑列表也 mock 掉 —— 它走 react-query，而这套测试没有 `QueryClientProvider`
 * （也不需要：平铺逻辑是纯展示）。
 */
const themesRef: { data: Theme[]; isLoading: boolean } = { data: [], isLoading: false };
const deploymentsRef: { data: ThemeDeploymentSummary[] } = { data: [] };
const removeDeploymentMutate = vi.fn();

vi.mock('@/hooks/useThemes', () => ({
  useThemes: () => themesRef,
  useThemeDeployments: () => deploymentsRef,
  useRemoveDeployment: () => ({ mutate: removeDeploymentMutate, isPending: false }),
}));

/** 没有上下文时页面退回「全部行平铺」的老行为，所以默认给 `null`；
 *  需要验「工作空间视角」的用例自己塞一个值进去。 */
const workspaceRef: { value: unknown } = { value: null };
vi.mock('@/components/layout/WorkspaceContext', () => ({
  useWorkspace: () => workspaceRef.value,
}));

function theme(overrides: Partial<Theme> = {}): Theme {
  return {
    code: 'default',
    name: '默认主题',
    description: null,
    data: { version: 1 },
    counts: { assets: 0, maps: 0, characters: 0, puzzles: 0, games: 0 },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function game(overrides: Partial<MapGameSummary> = {}): MapGameSummary {
  return {
    id: 3,
    puzzleId: 9,
    themeCode: 'default',
    puzzleName: '午夜花园',
    puzzleVersionNo: 2,
    name: '午夜花园',
    slug: 'puzzle-midnight-garden-medium',
    coverUrl: null,
    difficulty: 3,
    sortWeight: 0,
    gridSize: 6,
    participantCount: 6,
    createdAt: '2026-01-04T00:00:00.000Z',
    ...overrides,
  };
}

/** 一条主题合辑 —— 目录，不是内容（§9）。 */
function deployment(overrides: Partial<ThemeDeploymentSummary> = {}): ThemeDeploymentSummary {
  return {
    id: 7,
    themeCode: 'default',
    themeName: '默认主题',
    slug: 'hlm-collection',
    name: '默认合辑',
    description: null,
    coverUrl: null,
    entries: [
      {
        puzzleId: 9,
        puzzleName: '午夜花园',
        sortOrder: 0,
        game: game(),
      },
    ],
    createdAt: '2026-01-05T00:00:00.000Z',
    updatedAt: '2026-01-05T00:00:00.000Z',
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
    code: null,
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
    weightMutate.mockClear();
    removeDeploymentMutate.mockClear();
    workspaceRef.value = null;
    themesRef.data = [theme()];
    themesRef.isLoading = false;
    deploymentsRef.data = [];
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

  it('取消部署要二次确认，且写明链接立刻失效、路径可以再用', () => {
    render();
    clickButton('取消部署');
    expect(text()).toContain('玩家通过 /play/puzzle-midnight-garden-medium 将立即无法访问');
    expect(text()).toContain('可以再用同一个访问路径重新部署');
    // 还没确认，不发请求。
    expect(cancelMutate).not.toHaveBeenCalled();
  });

  /**
   * v0.8.1：平铺列表里合辑也是一行，摆在单局上面；已经进了合辑的单局不再
   * 重复列一遍 —— 合辑行已经把它算进去了。
   */
  it('合辑平铺在单局上面，进了合辑的单局不重复列', () => {
    deploymentsRef.data = [deployment()];
    render();

    expect(text()).toContain('合辑「默认合辑」');
    expect(text()).toContain('hlm-collection');
    // 成员「午夜花园」的单局行不再重复 —— 合辑行已经把它算进去了。
    expect(text()).not.toContain('puzzle-midnight-garden-medium');
    // 页头数字 = 单局行数，不含合辑成员。
    expect(text()).toContain('共 0 个游戏在线。');
  });

  /** 工作空间里只列**这个主题**的关，别的主题一行都不混进来（§18）。 */
  it('在工作空间里只列当前主题的关 —— 别的主题既不分组也不并进「未归入」', () => {
    const hlm = theme({ code: 'hlm', name: '红楼梦' });
    workspaceRef.value = {
      theme: hlm,
      themes: [theme(), hlm],
      themeCode: 'hlm',
      href: (module: string) => `/hlm/${module}`,
    };
    gamesRef.data = [
      game(),
      game({ id: 4, themeCode: 'hlm', name: '撕扇', puzzleName: '撕扇', slug: 'puzzle-hlm-sishan' }),
    ];
    render();

    expect(text()).toContain('撕扇');
    expect(text()).not.toContain('午夜花园');
    expect(text()).not.toContain('默认主题');
    expect(text()).not.toContain('未归入主题');
    expect(text()).toContain('共 1 个游戏在线。');
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

  /**
   * v0.8.2：导出清单与服务端同一把尺子 —— **只列当前主题的在线关**。
   *
   * 原来这里把 `gamesQuery.data`（全站）直接交给弹窗：清单会列出别的主题的关，
   * 而服务端只打这个主题，于是「清单 8 关、包里 2 关」这种无从解释的差。
   */
  it('导出清单只列当前主题的关', () => {
    const hlm = theme({ code: 'hlm', name: '红楼梦' });
    workspaceRef.value = {
      theme: hlm,
      themes: [theme(), hlm],
      themeCode: 'hlm',
      href: (module: string) => `/hlm/${module}`,
    };
    gamesRef.data = [
      game(),
      game({ id: 4, themeCode: 'hlm', name: '撕扇', puzzleName: '撕扇', slug: 'puzzle-hlm-sishan' }),
    ];
    render();

    act(() =>
      Array.from(container.querySelectorAll('button'))
        .find((node) => node.textContent?.trim() === '导出包')
        ?.click(),
    );

    expect(text()).toContain('导出资源包 · 红楼梦');
    expect(text()).toContain('撕扇');
    expect(text()).not.toContain('午夜花园');
    expect(text()).toContain('共 1 关');
  });

  /**
   * 列表为了不重复展示排掉了合辑里的单局，但包里必须有它们 —— 这两件事用的是
   * 不同的集合，别让「列表看不见」变成「包里没有」。
   */
  it('进了合辑的关不出现在列表里，但仍算在导出清单里', () => {
    const hlm = theme({ code: 'hlm', name: '红楼梦' });
    workspaceRef.value = {
      theme: hlm,
      themes: [theme(), hlm],
      themeCode: 'hlm',
      href: (module: string) => `/hlm/${module}`,
    };
    const sishan = game({
      id: 4,
      puzzleId: 30,
      themeCode: 'hlm',
      name: '撕扇',
      puzzleName: '撕扇',
      slug: 'puzzle-hlm-sishan',
    });
    gamesRef.data = [sishan];
    deploymentsRef.data = [
      deployment({
        themeCode: 'hlm',
        themeName: '红楼梦',
        name: '红楼梦合辑',
        entries: [{ puzzleId: 30, puzzleName: '撕扇', sortOrder: 0, game: sishan }],
      }),
    ];
    render();

    // 列表：合辑一行，单局不重复。
    expect(text()).toContain('合辑「红楼梦合辑」');
    expect(text()).toContain('共 0 个游戏在线。');

    act(() =>
      Array.from(container.querySelectorAll('button'))
        .find((node) => node.textContent?.trim() === '导出包')
        ?.click(),
    );
    expect(text()).toContain('共 1 关');
  });

  /**
   * v0.8.5：路径列只留尾部。v0.8.5 §3：连 `puzzle-` 那段也剥掉。
   *
   * `/play/` 与 `puzzle-` 在每一行都一样，却占着最宽的一列；复制按钮也随全路径
   * 一起撤掉 —— 一个不是完整地址的字符串，复制出去也用不了。
   */
  it('路径列只显示中段（不显示 /play/ 与 puzzle-），也没有复制按钮', () => {
    render();

    expect(text()).toContain('midnight-garden-medium');
    expect(text()).not.toContain('puzzle-midnight-garden-medium');
    expect(text()).not.toContain('/play/');
    // 完整地址没丢，挪到了 `title` 里（悬停可见，也是「打开游戏」那颗按钮的去处）。
    expect(
      container.querySelector('[title="/play/puzzle-midnight-garden-medium"]'),
    ).not.toBeNull();
    expect(
      Array.from(container.querySelectorAll('button')).some((node) =>
        node.getAttribute('aria-label')?.includes('复制'),
      ),
    ).toBe(false);
  });

  /**
   * v0.8.5：顺序列 —— 平时是数字，点开是输入框；回车与失焦是同一条收尾路径，
   * **值真的变了**才写回。
   *
   * 三条都在这里：改了要发；没改不发（点开看一眼是常事）；不合法不发（这一格
   * 没有弹窗可以承载错误，把 `1.5` 交给服务端只会得到一句 400）。
   */
  it('顺序格点开变输入框：回车与失焦改值，值没变或不合法则不写回', () => {
    render();

    const cellButton = (): HTMLButtonElement => {
      const found = container.querySelector<HTMLButtonElement>('button[aria-label="展示顺序"]');
      if (!found) throw new Error('顺序格没渲染出来');
      return found;
    };
    const openEditor = (): HTMLInputElement => {
      act(() => cellButton().click());
      const input = container.querySelector<HTMLInputElement>('input[aria-label="展示顺序"]');
      if (!input) throw new Error('输入框没出现');
      return input;
    };
    const type = (input: HTMLInputElement, value: string): void => {
      const setter = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(input),
        'value',
      )?.set;
      setter?.call(input, value);
      act(() => input.dispatchEvent(new Event('input', { bubbles: true })));
    };
    const pressEnter = (input: HTMLInputElement): void => {
      act(() =>
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
      );
    };

    // 收起时就是一个数字（前面那个「序」是这一列的标签，没有表头，得自己说清楚）。
    expect(cellButton().textContent).toContain('0');

    // 回车提交。
    let input = openEditor();
    type(input, '5');
    pressEnter(input);
    expect(weightMutate).toHaveBeenCalledWith({ id: 3, sortWeight: 5 });
    expect(container.contains(input)).toBe(false);

    // 失焦同样提交，负数也行（作者可以把一关顶到最前面）。
    weightMutate.mockClear();
    input = openEditor();
    type(input, '-2');
    act(() => input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    expect(weightMutate).toHaveBeenCalledWith({ id: 3, sortWeight: -2 });

    // 值没变：收起，不发请求。
    weightMutate.mockClear();
    input = openEditor();
    type(input, '0');
    pressEnter(input);
    expect(weightMutate).not.toHaveBeenCalled();

    // 不合法：同样只收起，不发请求。
    input = openEditor();
    type(input, '1.5');
    pressEnter(input);
    expect(weightMutate).not.toHaveBeenCalled();
  });
});
