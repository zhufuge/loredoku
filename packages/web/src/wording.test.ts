import { describe, expect, it } from 'vitest';

/**
 * OPT-H02（docs/v0.4.2.md §2）：地图管理页的文案统一 —— 用户看得见的「项目」
 * 一律改叫「地图」。代码标识符（`Project` / `projectId` / API 路径 / 表名）**不动**。
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
    expect(page).toContain('删除地图「{deleteTarget?.name}」？');
    expect(page).toContain('将同时删除画布上的所有卡片与区域，不可恢复。');

    const form = sources['./components/project/ProjectFormDialogs.tsx'] ?? '';
    expect(form).toContain('新建地图');
    expect(form).toContain('编辑地图');

    const toolbar = sources['./components/editor/EditorToolbar.tsx'] ?? '';
    expect(toolbar).toContain('返回地图列表');
  });
});
