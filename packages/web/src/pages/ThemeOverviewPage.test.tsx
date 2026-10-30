import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Theme } from '@loredoku/shared';
import { ThemeOverviewPage } from './ThemeOverviewPage';

/**
 * v0.8.3：概览页只回答两件事 —— 「这个空间是什么」与「它按什么规矩长」。
 *
 * 这一屏在这一版动过的地方不少，所以钉五组：
 *
 * 1. 五格计数是**入口**，图标与顶栏同一枚；
 * 2. 信息卡四行，页头**没有**上线 / 导出 / `⋯` —— 动作平铺成两个按钮；
 * 3. 缺省风格是清单（二十几项按四组列），点「编辑缺省风格」打开表单，保存写回 `data.style`；
 * 4. 难度分级是清单（缺省 = 内置五档），点「编辑难度分级」能增删排序，保存写回 `data.difficultyLevels`；
 * 5. 导出资源包已经搬到部署页 —— 这一页不该再出现它。
 */

const themeRef: Theme = {
  code: 'hlm',
  name: '红楼梦',
  description: '大观园里的推理。',
  data: { version: 1 },
  counts: { assets: 49, maps: 8, characters: 32, puzzles: 8, games: 6 },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const workspaceRef: { value: unknown } = { value: null };
const deleteMutate = vi.fn(() => Promise.resolve());
const updateMutate = vi.fn((_payload: unknown) => Promise.resolve());

vi.mock('@/components/layout/WorkspaceContext', () => ({
  useWorkspace: () => workspaceRef.value,
}));
vi.mock('@/hooks/useThemes', () => ({
  useUpdateTheme: () => ({ mutateAsync: updateMutate, isPending: false }),
  useDeleteTheme: () => ({ mutateAsync: deleteMutate, isPending: false }),
}));

describe('ThemeOverviewPage（v0.8.3）', () => {
  let container: HTMLDivElement;
  let root: Root;

  const text = (): string => document.body.textContent ?? '';
  const button = (label: string): HTMLButtonElement | undefined =>
    Array.from(document.querySelectorAll('button')).find(
      (node) =>
        node.textContent?.trim() === label ||
        node.textContent?.trim().includes(label) === true ||
        node.getAttribute('aria-label')?.includes(label) === true,
    );
  const hrefs = (): string[] =>
    Array.from(document.querySelectorAll('a')).map((node) => node.getAttribute('href') ?? '');

  function render(theme: Theme = themeRef): void {
    workspaceRef.value = {
      theme,
      themes: [theme],
      themeCode: theme.code,
      href: (module: string) => `/hlm/${module}`,
    };
    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/hlm/overview']}>
          <ThemeOverviewPage />
        </MemoryRouter>,
      );
    });
  }

  /** 改一个输入框的值。React 认原型上的 setter，直接赋值它看不见。 */
  function type(input: HTMLInputElement, value: string): void {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    act(() => {
      setter?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  beforeEach(() => {
    deleteMutate.mockClear();
    updateMutate.mockClear();
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('五格计数既是数字也是入口 —— 点进去是本主题的模块', () => {
    render();

    expect(text()).toContain('49');
    expect(text()).toContain('32');
    expect(hrefs()).toEqual(
      expect.arrayContaining([
        '/hlm/assets',
        '/hlm/maps',
        '/hlm/characters',
        '/hlm/puzzles',
        '/hlm/deployments',
      ]),
    );
    expect(text()).toContain('部署');
  });

  it('五格的图标与顶栏同一枚 —— 地图就是 lucide-map，不是定位针', () => {
    render();

    const cards = Array.from(document.querySelectorAll('a[href^="/hlm/"]')).filter(
      (node) => node.querySelector('svg') !== null,
    );
    expect(cards.length).toBe(5);

    const icons = cards.map((node) => node.querySelector('svg')?.getAttribute('class') ?? '');
    expect(icons[1]).toContain('lucide-map');
    expect(icons[4]).toContain('lucide-rocket');
    expect(document.querySelector('svg.lucide-map-pin')).toBeNull();
    for (const icon of icons) {
      expect(icon).toContain('h-6');
      expect(icon).toContain('w-6');
    }
    expect(cards[1]?.querySelector('svg')?.getAttribute('stroke-width')).toBe('1.5');
  });

  it('信息卡是名称 / 编码 / 描述 / 识别色四行', () => {
    render();

    for (const label of ['名称', '编码', '描述', '识别色']) {
      expect(text()).toContain(label);
    }
    expect(text()).toContain('红楼梦');
    expect(text()).toContain('hlm');
    expect(text()).not.toContain('还没有关卡上线');
  });

  /**
   * v0.8.3：动作平铺。
   *
   * 之前是「上线」在页头 + 导出 / 编辑 / 删除藏在 `⋯` 里。上线与导出都搬去了
   * 部署页（那才是「出门」发生的地方），剩下的两个动作直接摆在页头上 ——
   * 一个装两个按钮的菜单，比两个按钮贵。
   */
  it('页头只有「编辑信息」与「删除主题」，没有上线 / 导出 / 更多操作', () => {
    render();

    expect(button('编辑信息')).toBeDefined();
    expect(button('删除主题')).toBeDefined();
    expect(button('更多操作')).toBeUndefined();
    expect(button('导出资源包')).toBeUndefined();
    expect(button('上线')).toBeUndefined();
  });

  it('缺省风格是一张清单：四组都在，值按新建地图会拿到的那份显示', () => {
    render();

    expect(text()).toContain('缺省风格');
    for (const group of ['网格', '边框', '标签', '光标']) {
      expect(text()).toContain(group);
    }
    // 代表项：线宽与颜色各一条。
    expect(text()).toContain('网格分隔线线宽');
    expect(text()).toContain('网格分隔线颜色');
    expect(text()).toContain('标签字体');
  });

  it('编辑缺省风格：改一项线宽，保存写回 data.style（其余键原样带着）', () => {
    render();
    act(() => button('编辑缺省风格')?.click());

    const width = document.querySelector<HTMLInputElement>('#theme-style-gridSeparator\\.width');
    expect(width).not.toBeNull();
    type(width as HTMLInputElement, '4');
    act(() => button('保存')?.click());

    expect(updateMutate).toHaveBeenCalledTimes(1);
    const payload = updateMutate.mock.calls[0]?.[0] as {
      data: { version: number; style: { gridSeparator: { width: number } } };
    };
    expect(payload.data.version).toBe(1);
    expect(payload.data.style.gridSeparator.width).toBe(4);
  });

  it('难度分级缺省就是内置五档，名字是中文', () => {
    render();

    expect(text()).toContain('难度分级');
    for (const label of ['极简', '简单', '中等', '困难', '专家']) {
      expect(text()).toContain(label);
    }
  });

  it('主题自定义过分级时，清单显示自定义的那几档', () => {
    render({
      ...themeRef,
      data: {
        version: 1,
        difficultyLevels: [
          { key: 'warmup', label: '热身' },
          { key: 'brutal', label: '地狱' },
        ],
      },
    });

    expect(text()).toContain('热身');
    expect(text()).toContain('地狱');
    expect(text()).not.toContain('极简');
  });

  it('编辑难度分级：加一档后保存，写回 data.difficultyLevels', () => {
    render();
    act(() => button('编辑难度分级')?.click());
    act(() => button('添加一档')?.click());
    act(() => button('保存')?.click());

    const payload = updateMutate.mock.calls[0]?.[0] as {
      data: { difficultyLevels?: Array<{ key: string; label: string }> };
    };
    expect(payload.data.difficultyLevels).toHaveLength(6);
    expect(payload.data.difficultyLevels?.[5]?.key).toBe('tier-1');
  });

  /**
   * 回归：改名字**不改 key**，所以第一版那道 `isBuiltIn` 判断（只比 key）把这次
   * 编辑当成了「还是内置五档」，`difficultyLevels` 被删掉 → 保存后名字又变回去。
   * 作者看到的就是「保存不生效」。名字恰恰是这一屏唯一能自定义的东西之一。
   */
  it('只改名字也要写回 —— 名字正是要存的东西', () => {
    render();
    act(() => button('编辑难度分级')?.click());
    const input = document.querySelector<HTMLInputElement>(
      '[role="dialog"] input[aria-label="第 1 档名称"]',
    ) as HTMLInputElement;
    type(input, '入门');
    act(() => button('保存')?.click());

    const payload = updateMutate.mock.calls[0]?.[0] as {
      data: { difficultyLevels?: Array<{ key: string; label: string }> };
    };
    expect(payload.data.difficultyLevels).toHaveLength(5);
    expect(payload.data.difficultyLevels?.[0]).toEqual({ key: 'veryEasy', label: '入门' });
  });

  it('什么都没改就保存，不带 difficultyLevels —— 等同「没配过」', () => {
    render();
    act(() => button('编辑难度分级')?.click());
    act(() => button('保存')?.click());

    const payload = updateMutate.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect('difficultyLevels' in payload.data).toBe(false);
  });

  /**
   * 「恢复内置五档」不是写一份和内置一模一样的数组 —— 它把 `difficultyLevels`
   * 这个键**删掉**，回到「没配过」。以后内置改了，这类主题跟着改。
   */
  it('恢复内置五档后保存，payload 里没有 difficultyLevels 这个键', () => {
    render({
      ...themeRef,
      data: { version: 1, difficultyLevels: [{ key: 'warmup', label: '热身' }] },
    });
    act(() => button('编辑难度分级')?.click());
    act(() => button('恢复内置五档')?.click());
    act(() => button('保存')?.click());

    const payload = updateMutate.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect('difficultyLevels' in payload.data).toBe(false);
  });

  it('识别色是一行事实：设过就出色块与色值，没设就是两个字的「未设置」', () => {
    render();
    expect(text()).toContain('未设置');

    render({ ...themeRef, data: { version: 1, accent: '#B93A32' } });
    expect(text()).toContain('#B93A32');
  });

  it('没有描述时说「未填写」，而不是留一个空行', () => {
    render({ ...themeRef, description: null });
    expect(text()).toContain('未填写');
  });

  it('主题里还有东西时「删除」不可点 —— 先把数量说清楚再拦', () => {
    render();
    act(() => button('删除主题')?.click());

    expect(text()).toContain('主题下还有 49 个资源');
    const confirm = Array.from(document.querySelectorAll('button')).find(
      (node) => node.textContent?.trim() === '删除',
    ) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
  });
});
