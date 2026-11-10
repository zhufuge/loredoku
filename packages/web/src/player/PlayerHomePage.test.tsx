import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BUNDLE_FORMAT, BUNDLE_FORMAT_VERSION } from '@loredoku/shared';
import type { BundleManifest } from '@loredoku/shared';
import { recordGameCompletion } from '@/lib/gameCompletion';
import { bundleStorageId } from './bundleLoad';
import { PlayerHomePage } from './PlayerHomePage';

/**
 * 2026-11-09 补（docs/v0.9.0.md §13）：列表页徽章上的字必须来自主题配置。
 *
 * v0.9.0 的播放器把包读进来了，却没给 `GameCard` 传 `tiers`；这一页又在
 * `WorkspaceLayout` 外面，`DifficultyBadge` 于是退回内置五档 —— 作者配的
 * 「初 / 通」在下载包里变成「极简 / 简单」。这里从**渲染出来的文字**钉住它，
 * 而不是只测某个函数返回了什么：漏传 props 这种错，纯函数测试是抓不到的。
 */

const manifestRef: {
  data: BundleManifest | null;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
} = { data: null, isLoading: false, isError: false, error: null };

vi.mock('./PlayerBundleProvider', () => ({
  useBundleManifest: () => manifestRef,
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

  it('包里乱序也没关系：按 level 排，颜色同样跟着主题', () => {
    manifestRef.data = manifest({
      ...identity,
      difficultyLevels: [
        { level: 3, label: '精', color: '#B93A32' },
        { level: 1, label: '初' },
        { level: 2, label: '通' },
      ],
    });
    mount();

    const styled = Array.from(document.querySelectorAll('[role="button"] span')).find(
      (node) => node.textContent?.trim() === '精',
    ) as HTMLElement | undefined;
    expect(styled?.style.backgroundColor).toContain('#B93A32');
  });

  it('v0.9.0 的老包不带分级 → 仍是内置五档，不报错也不空白', () => {
    manifestRef.data = manifest(identity);
    mount();

    const texts = badges();
    expect(texts).toContain('简单');
    expect(texts).toContain('中等');
  });

  /**
   * v0.9.5：通过的关卡在播放器的列表页也留「印 + 用时」。
   *
   * 关键是**存档键**：离线包用的是 `bundle:<code>:<key>`，与线上那套（裸 slug）
   * 互不相通（v0.8.0 §11.6）。这里按包键写一条，再确认卡片认得出它 —— 顺手守住
   * 「别把线上那套键也读进来」的边界。
   */
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
});
