import { describe, expect, it } from 'vitest';

/**
 * OPT-H02（docs/v0.4.2.md §2）：地图管理页的文案统一 —— 用户看得见的「项目」
 * 一律改叫「地图」。代码标识符（`Project` / `projectId` / API 路径 / 表名）**不动**。
 *
 * v0.5.0（docs/v0.5.0.md §14 标准 1）：作品模块整体删除 —— 导航里不再有「作品」，
 * `/works` 路由不存在。这里对「作品」做同款零出现断言。
 *
 * 做法：把 `src` 下所有源码以 `?raw` 读进来（测试文件除外），逐文件断言不含
 * 中文字符串「项目」。这比逐个文件列清单更难被漏掉。
 */

const sources = import.meta.glob('./**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const productionFiles = Object.entries(sources).filter(([path]) => !path.includes('.test.'));

/**
 * 「项目」连注释一起禁（历史上就是全清）。
 *
 * 「作品」只禁**用户可见**的部分：迁移说明里写「原『作品』模块换成谜题」对读代码
 * 的人是有价值的信息，所以先剥掉块注释与整行行注释，再扫剩下的代码。
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');
}

describe('用户可见文案：项目 → 地图（OPT-H02 §2）', () => {
  it('scans the whole web source tree', () => {
    // Sanity: the glob really did pick up the app.
    expect(productionFiles.length).toBeGreaterThan(60);
  });

  it('no production file renders the word 「项目」', () => {
    const offenders = productionFiles
      .filter(([, source]) => source.includes('项目'))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  it('the code identifiers are deliberately left alone', () => {
    const page = sources['./pages/ProjectsPage.tsx'] ?? '';
    expect(page).toContain('ProjectGridCard');
    expect(page).toContain('useProjects');
    // The route stays /projects — only the label changed.
    expect(page).not.toContain('项目');
  });

  it('the main surfaces speak 地图', () => {
    const page = sources['./pages/ProjectsPage.tsx'] ?? '';
    expect(page).toContain('地图 · 格物');
    expect(page).toContain('创建、管理并编辑你的地图。');
    expect(page).toContain('新建地图');
    expect(page).toContain('搜索地图名称');
    expect(page).toContain('还没有地图，创建一个开始吧');
    expect(page).toContain('没有匹配的地图');
    expect(page).toContain('删除地图「${deleteTarget?.name}」？');
    expect(page).toContain('将同时删除画布上的所有卡片与区域，不可恢复。');

    const form = sources['./components/project/ProjectFormDialogs.tsx'] ?? '';
    expect(form).toContain('新建地图');
    expect(form).toContain('编辑地图');

    const toolbar = sources['./components/editor/EditorToolbar.tsx'] ?? '';
    expect(toolbar).toContain('返回地图列表');
  });
});

describe('用户可见文案：作品 → 谜题（v0.5.0 §14 标准 1）', () => {
  it('no production file renders the word 「作品」', () => {
    const offenders = productionFiles
      .filter(([, source]) => stripComments(source).includes('作品'))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  it('the navigation is 地图 / 谜题 / 物品 / 角色', () => {
    const shell = sources['./components/layout/AppShell.tsx'] ?? '';
    expect(shell).toContain("label: '谜题'");
    expect(shell).toContain("to: '/puzzles'");
    expect(shell).not.toContain("to: '/works'");
  });

  it('/works is gone from the router', () => {
    const router = sources['./router.tsx'] ?? '';
    expect(router).toContain("path: 'puzzles'");
    expect(router).not.toContain("path: 'works'");
    expect(router).not.toContain('/works/:workId/view');
  });

  it('the puzzle table keeps the v0.4.3 works table wording', () => {
    const page = sources['./pages/PuzzlesPage.tsx'] ?? '';
    expect(page).toContain("const COLUMNS = ['名称', '版本', '部署状态', '发布时间', '操作'] as const;");
    expect(page).toContain('查看效果');
    expect(page).toContain('新建谜题');
  });
});

/**
 * FEAT-L04（docs/v0.5.1.md §4）：游戏路由 `/games` → `/play`。
 *
 * `/api/games*` 是内部接口、用户不可见，本版不改 —— 所以只扫**页面路由**口径：
 * 去掉 `api/games` 之后，任何 `` `/games… `` 模板串都必须是残留。
 */
describe('游戏路由：/games → /play（v0.5.1 FEAT-L04）', () => {
  /**
   * `src/api/**` is the **HTTP client**: its `/games…` strings are API
   * endpoints (`/api/games` once `apiGet` prefixes them), which v0.5.1 leaves
   * alone (docs/v0.5.1.md §4 实现期裁定 R2). Only the rest of the tree is
   * page-route territory.
   */
  const pageFiles = productionFiles.filter(([path]) => !path.startsWith('./api/'));

  /**
   * Module specifiers such as `from '@/api/games'` also contain `/games`, so
   * import lines are dropped before the scan — what must be zero is a **page**
   * route, i.e. a `/games…` string literal somewhere else.
   */
  function withoutImports(source: string): string {
    return stripComments(source)
      .split('\n')
      .filter((line) => !/^\s*import\b/.test(line) && !/\bfrom\s+['"]/.test(line))
      .join('\n');
  }

  it('no production file still links to a /games page route', () => {
    const offenders = pageFiles
      .filter(([, source]) => withoutImports(source).includes('/games'))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  it('the API client keeps its /games endpoints — only the page路由 moved', () => {
    const api = sources['./api/games.ts'] ?? '';
    expect(api).toContain("'/games'");
    expect(api).toContain('`/games/slug/${encodeURIComponent(slug)}`');
    expect(api).not.toContain('/play');
  });

  it('the router registers /play and /play/:slug', () => {
    const router = sources['./router.tsx'] ?? '';
    expect(router).toContain("path: '/play'");
    expect(router).toContain("path: '/play/:slug'");
    expect(router).not.toContain("path: '/games'");
    expect(router).not.toContain("path: '/games/:slug'");
  });

  it('every entry point into a game uses the new path', () => {
    // The card, the 已部署 badge on the puzzle table and the game page's own
    // back buttons.
    expect(sources['./components/game/GameCard.tsx'] ?? '').toContain('navigate(`/play/${game.slug}`)');
    expect(sources['./pages/PuzzlesPage.tsx'] ?? '').toContain('navigate(`/play/${game.slug}`)');
    const page = sources['./pages/GamePage.tsx'] ?? '';
    expect(page).toContain("navigate('/play')");
    expect(page).not.toContain("navigate('/games')");
  });

  it('the deploy dialog previews the new path', () => {
    expect(sources['./components/game/GameDeployDialog.tsx'] ?? '').toContain('`/play/${slug}`');
  });
});
