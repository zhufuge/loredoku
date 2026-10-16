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

  it('keeps 选择 / 区域 / 物品 / 尺寸可点 on the map side (SPEC-K12 回归)', () => {
    // v0.5.0 只把参与者从地图编辑器删掉；地图侧的写工具一样不少 ——
    // 「尺寸可点」（onOpenResize → 「调整画布尺寸」弹窗）是谜题侧唯一被
    // 降级成纯展示的东西，这里钉住地图侧没有跟着降级。
    const sizeAt = barSource.indexOf('onClick={onOpenResize}');
    expect(sizeAt).toBeGreaterThan(-1);
    const sizeButton = barSource.slice(barSource.lastIndexOf('<Button', sizeAt), sizeAt);
    expect(sizeButton).toContain('title="画布尺寸 n（与「基本信息」中的 n 一致）"');
    expect(barSource).toContain('onOpenResize: () => void;');
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

describe('EditorLeftPanel (v0.5.0 SPEC-K12 §9.1: the 角色 tab is gone)', () => {
  it('keeps only 物品 / 区域 — the roster moved to the puzzle editor', () => {
    const tabs = leftPanelSource.slice(
      leftPanelSource.indexOf('const TABS'),
      leftPanelSource.indexOf('const LAYER_LABELS'),
    );
    const labels = Array.from(tabs.matchAll(/label: '([^']+)'/g)).map((match) => match[1]);
    expect(labels).toEqual(['物品', '区域']);
    // SPEC-K04: the roster's whole branch (and its props) left with it.
    expect(leftPanelSource).not.toContain('characterSlots');
    expect(leftPanelSource).not.toContain('selectedCharacterId');
    expect(leftPanelSource).not.toContain('onAssignSlot');
    expect(leftPanelSource).not.toContain('onSelectCharacter');
  });
});
