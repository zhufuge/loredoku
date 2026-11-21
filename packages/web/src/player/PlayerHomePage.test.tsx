import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BUNDLE_FORMAT, BUNDLE_FORMAT_VERSION } from '@loredoku/shared';
import type { BundleManifest } from '@loredoku/shared';
import { recordGameCompletion } from '@/lib/gameCompletion';
import { bundleStorageId } from './bundleLoad';
import { PlayerHomePage } from './PlayerHomePage';

/** 2026-11-09 补（docs/v0.9.0.md §13）：列表页徽章上的字必须来自主题配置。 这里从**渲染出来的文字**钉住它， 而不是只测某个函数返回了什么：漏传 props 这种错，纯函数测试是抓不到的。 */

const manifestRef: {
  data: BundleManifest | null;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
} = { data: null, isLoading: false, isError: false, error: null };

vi.mock('./PlayerBundleProvider', () => ({
  useBundleManifest: () => manifestRef,
}));

/** 列表页要等自带字体就绪才放内容。真去 `document.fonts.load()` 在 jsdom 里永远等不到，所以这里换成一根可控的开关；字体本身的行为在 `src/lib/fonts.test.ts` 那边单独钉。 */
const fontsRef: { ready: boolean } = { ready: true };
vi.mock('@/hooks/useBundledFontsReady', () => ({
  useBundledFontsReady: () => fontsRef.ready,
}));

function manifest(theme: BundleManifest['theme']): BundleManifest {
  return {
    format: BUNDLE_FORMAT,
    formatVersion: BUNDLE_FORMAT_VERSION,
    exportedAt: '2026-11-09T00:00:00.000Z',
    theme,
    games: [
      {
        key: 'puzzle-sishan',
        file: 'puzzles/puzzle-sishan.json',
        name: '撕扇',
        puzzleName: '撕扇',
        gridSize: 4,
        difficulty: 2,
        cover: null,
      },
      {
        key: 'puzzle-yinqilin',
        file: 'puzzles/puzzle-yinqilin.json',
        name: '因麒麟伏白首双星',
        puzzleName: '因麒麟伏白首双星',
        gridSize: 5,
        difficulty: 3,
        cover: null,
      },
    ],
    assets: 'assets.json',
    characters: 'characters.json',
    fonts: [],
    files: [],
    originIds: { assets: {}, characters: {}, games: {} },
  };
}

const identity = { code: 'hlm', name: '红楼梦', description: null };

/** 徽章是 `<span>`，文字就在里面；按卡片找，不依赖 class 名。 */
function badges(): string[] {
  return Array.from(document.querySelectorAll('[role="button"] span'))
    .map((node) => node.textContent?.trim() ?? '')
    .filter((text) => text.length > 0);
}

describe('PlayerHomePage 的难度徽章', () => {
  let container: HTMLDivElement;
  let root: Root;

  function mount(): void {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/hlm/play']}>
          <Routes>
            <Route path="/:code/play" element={<PlayerHomePage />} />
          </Routes>
        </MemoryRouter>,
      );
    });
  }

  beforeEach(() => {
    window.localStorage.clear();
    manifestRef.isLoading = false;
    manifestRef.isError = false;
    manifestRef.error = null;
    fontsRef.ready = true;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    window.localStorage.clear();
  });

  it('主题配了分级 → 两张卡都写主题的字，不出现内置五档的叫法', () => {
    manifestRef.data = manifest({
      ...identity,
      difficultyLevels: [
        { level: 1, label: '初' },
        { level: 2, label: '通' },
        { level: 3, label: '精' },
      ],
    });
    mount();

    const texts = badges();
    expect(texts).toContain('通');
    expect(texts).toContain('精');
    expect(texts).not.toContain('简单');
    expect(texts).not.toContain('中等');
  });

  it('包里乱序也没关系：徽章按 level 排', () => {
    manifestRef.data = manifest({
      ...identity,
      difficultyLevels: [
        { level: 3, label: '精', color: '#B93A32' },
        { level: 1, label: '初' },
        { level: 2, label: '通' },
      ],
    });
    mount();

    const texts = badges();
    expect(texts.indexOf('初')).toBeLessThan(texts.indexOf('通'));
    expect(texts.indexOf('通')).toBeLessThan(texts.indexOf('精'));
  });

  it('v0.9.0 的老包不带分级 → 仍是内置五档，不报错也不空白', () => {
    manifestRef.data = manifest(identity);
    mount();

    const texts = badges();
    expect(texts).toContain('简单');
    expect(texts).toContain('中等');
  });

  /** 通过的关卡在播放器的列表页也留「印 + 用时」。 关键是**存档键**：离线包用的是 `bundle:<code>:<key>`，与线上那套（裸 slug） 互不相通（v0.8.0 §11.6）。这里按包键写一条，再确认卡片认得出它 —— 顺手守住「别把线上那套键也读进来」的边界。 */
  it('通过记录按包键读：封面盖上那枚印、页脚写出用时', () => {
    manifestRef.data = manifest(identity);
    recordGameCompletion(bundleStorageId('hlm', 'puzzle-sishan'), { gridSize: 4 }, {
      elapsedMs: 187_000,
      stampUrl: '/loredoku/hlm/files/icons/puzzle-sishan-submit.webp',
    });
    // 裸 slug 那条是线上那一套 —— 它在这里不该被认。
    recordGameCompletion('puzzle-yinqilin', { gridSize: 5 }, {
      elapsedMs: 60_000,
      stampUrl: '/api/files/themes/2/tool-icons/submit/a.webp',
    });
    mount();

    const covers = document.querySelectorAll('[data-testid="game-completion-cover"]');
    expect(covers).toHaveLength(1);
    expect(covers[0]?.querySelector('img')?.getAttribute('src')).toBe(
      '/loredoku/hlm/files/icons/puzzle-sishan-submit.webp',
    );

    const times = document.querySelectorAll('[data-testid="game-completion-time"]');
    expect(times).toHaveLength(1);
    expect(times[0]?.textContent).toContain('03:07');
  });

  /** v0.11.3（docs/v0.11.3.md §2）：列表页进入时先亮品牌字标，等包、字体、封面都到齐再放卡片。 判据用「有没有卡片」而不是断言某个类名：卡片是这一页最终要展示的东西， 它在与不在，就是玩家看到的两种状态。 */
  it('字体还没就绪 → 只出加载件，卡片一张都不画', () => {
    manifestRef.data = manifest(identity);
    fontsRef.ready = false;
    mount();

    expect(document.querySelectorAll('[role="button"]')).toHaveLength(0);
    expect(document.body.textContent).toContain('正在加载主题');
  });

  it('包还没到 → 同样只出加载件', () => {
    manifestRef.data = null;
    manifestRef.isLoading = true;
    mount();

    expect(document.querySelectorAll('[role="button"]')).toHaveLength(0);
    expect(document.body.textContent).toContain('正在加载主题');
  });

  it('字体与包都就绪 → 卡片出来，加载件退场', () => {
    manifestRef.data = manifest(identity);
    mount();

    expect(document.querySelectorAll('[role="button"]').length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain('正在加载主题');
  });

  /**
   * 包读失败不能躲在加载件后面 —— 那时已经没什么可等，得立刻把原因说出来。
   */
  it('包读失败 → 直接出错，不停在加载件上', () => {
    manifestRef.data = null;
    manifestRef.isError = true;
    manifestRef.error = new Error('manifest 404');
    fontsRef.ready = false;
    mount();

    expect(document.body.textContent).not.toContain('正在加载主题');
  });

  /** 顶上那两行字与工坊那边同一份配置（包导出时已经冻进 `manifest.theme.gameList`），没配过就退回内置那两句。 */
  describe('v0.11.6 计数行与难度过滤', () => {
    const passedCount = (): string =>
      document.querySelector('[data-testid="games-passed-count"]')?.textContent ?? '';
    const cards = (): number => document.querySelectorAll('[role="button"]').length;
    const chips = (): HTMLButtonElement[] =>
      Array.from(
        document.querySelectorAll<HTMLButtonElement>('[data-testid="games-difficulty-filter"] button'),
      );

    const tiers = [
      { level: 1, label: '初' },
      { level: 2, label: '通' },
      { level: 3, label: '精' },
    ];

    it('没配过就用内置那两句', () => {
      manifestRef.data = manifest({ ...identity, difficultyLevels: tiers });
      mount();

      expect(document.body.textContent).toContain('2 关可玩');
      expect(passedCount()).toBe('已通过 0 关');
    });

    it('主题配过就用配的，{n} 换成关数', () => {
      manifestRef.data = manifest({
        ...identity,
        difficultyLevels: tiers,
        gameList: { playable: '共 {n} 回', passed: '已了 {n} 桩' },
      });
      mount();

      expect(document.body.textContent).toContain('共 2 回');
      expect(passedCount()).toBe('已了 0 桩');
    });

    it('通过一关，那个数字跟着变', () => {
      manifestRef.data = manifest({ ...identity, difficultyLevels: tiers });
      recordGameCompletion(bundleStorageId('hlm', 'puzzle-sishan'), { gridSize: 4 }, {
        elapsedMs: 61_000,
        stampUrl: null,
      });
      mount();

      expect(passedCount()).toBe('已通过 1 关');
    });

    it('过滤条：「全部」在前，后面是主题的每一档；点某一档只剩那一档', () => {
      manifestRef.data = manifest({ ...identity, difficultyLevels: tiers });
      mount();

      expect(chips().map((chip) => chip.textContent?.trim())).toEqual(['全部', '初', '通', '精']);
      expect(cards()).toBe(2);

      act(() => chips()[3]?.click());
      expect(cards()).toBe(1);

      act(() => chips()[0]?.click());
      expect(cards()).toBe(2);
    });

    it('切档不改变「已通过 N 关」', () => {
      manifestRef.data = manifest({ ...identity, difficultyLevels: tiers });
      recordGameCompletion(bundleStorageId('hlm', 'puzzle-sishan'), { gridSize: 4 }, {
        elapsedMs: 61_000,
        stampUrl: null,
      });
      mount();
      const before = passedCount();

      act(() => chips()[3]?.click());

      expect(passedCount()).toBe(before);
      expect(before).toBe('已通过 1 关');
    });

    it('这一档没有关卡时给回「全部」的出口', () => {
      manifestRef.data = manifest({ ...identity, difficultyLevels: tiers });
      mount();

      act(() => chips()[1]?.click());

      expect(cards()).toBe(0);
      expect(document.body.textContent).toContain('这一档还没有关卡');

      act(() =>
        Array.from(document.querySelectorAll('button'))
          .find((node) => node.textContent?.trim() === '看全部')
          ?.click(),
      );
      expect(cards()).toBe(2);
    });
  });
});
