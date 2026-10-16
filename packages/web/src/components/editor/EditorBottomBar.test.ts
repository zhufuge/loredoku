import { describe, expect, it } from 'vitest';

/**
 * OPT-H11（docs/v0.4.2.md §11）：底栏工具条删除「放置角色」按钮。
 *
 * CLAR-603 之后角色**不进入地图**，放置参与者的路径是
 * 「左侧角色标签 → 加入 → 拖到参与者区」，与画布无关 —— 那个按钮的 tooltip
 * 写着「从左侧队伍槽位拖拽角色到画布即可落位」，本身就是一个死入口。
 *
 * `EditorTool` 联合类型仍然包含 `'character'`（§17 Q8：保留类型，避免牵动
 * store / schema / 扩展点），被移除的只是 UI 入口与快捷键提示。
 */

const barSource =
  ((import.meta.glob('./EditorBottomBar.tsx', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>)['./EditorBottomBar.tsx'] ?? '').replace(/\r\n/g, '\n');

const pageSource =
  ((import.meta.glob('../../pages/EditorPage.tsx', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>)['../../pages/EditorPage.tsx'] ?? '').replace(/\r\n/g, '\n');

const leftPanelSource =
  ((import.meta.glob('./EditorLeftPanel.tsx', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>)['./EditorLeftPanel.tsx'] ?? '').replace(/\r\n/g, '\n');

describe('EditorBottomBar tools (OPT-H11 §11.2)', () => {
  it('drops the 「放置角色」 entry entirely', () => {
    const tools = barSource.slice(barSource.indexOf('const TOOLS'), barSource.indexOf('const SHAPES'));
    expect(tools).not.toContain("id: 'character'");
    expect(tools).not.toContain('放置角色');
    expect(tools).not.toContain('队伍槽位');
    // The icon went with it — no dead import left behind.
    expect(barSource).not.toContain('User');
  });

  it('keeps exactly the three real tools, in order', () => {
    const tools = barSource.slice(barSource.indexOf('const TOOLS'), barSource.indexOf('const SHAPES'));
    const ids = Array.from(tools.matchAll(/id: '(\w+)'/g)).map((match) => match[1]);
    expect(ids).toEqual(['select', 'region', 'eraser']);
  });

  it('leaves the region-shape cluster and the rest of the bar untouched', () => {
    expect(barSource).toContain("{ id: 'rect', label: '矩形'");
    expect(barSource).toContain("{ id: 'brush', label: '自由笔刷'");
    expect(barSource).toContain('物品');
    expect(barSource).toContain('显示 / 隐藏标尺');
    expect(barSource).toContain('撤销 (Ctrl+Z)');
    expect(barSource).toContain('重做 (Ctrl+Shift+Z)');
  });
});

describe('EditorPage keyboard shortcuts (OPT-H11 §11.3)', () => {
  it('no longer registers C for 「放置角色」', () => {
    const keys = pageSource.slice(
      pageSource.indexOf("if (event.key === 'v' || event.key === 'V')"),
      pageSource.indexOf('FEAT-E03: no pan-tool shortcut any more'),
    );
    expect(keys).toContain("setTool('select')");
    expect(keys).toContain("setTool('region')");
    expect(keys).toContain("setTool('eraser')");
    expect(keys).not.toContain("'c'");
    expect(keys).not.toContain("'C'");
    expect(keys).not.toContain("setTool('character')");
  });
});

describe('EditorLeftPanel character tab copy (OPT-H11 §11.2)', () => {
  it('describes the real flow: 加入 → 参与者区 → 拖到画布', () => {
    expect(leftPanelSource).toContain(
      '点击角色可选中；点击「加入」放入右侧参与者区，再从参与者区拖拽到画布完成放置。',
    );
    expect(leftPanelSource).not.toContain('队伍槽位');
  });
});
