import { describe, expect, it } from 'vitest';

/**
 * SPEC-K07 / SPEC-K12（docs/v0.5.0.md §4.4 / §9.1）：谜题编辑器是**只读画布**。
 *
 * 底栏只剩查看类操作（标尺 / 尺寸展示 / 缩放 / 撤销重做）——写画布的工具
 * （选择 / 区域 / 物品 / 橡皮擦）全部不在；尺寸是纯展示的 `span`，没有
 * `onOpenResize`，整页也没有「调整画布尺寸」弹窗（尺寸由被引用地图版本决定）。
 * 顶栏没有「发布」（Q17：发布只发生在地图模块），左侧只有「角色」一个 tab。
 *
 * 渲染整页需要 query client / router / 预置双 store，与
 * `EditorPage.infoDrawer.test.ts` 同款：源码断言。断言前剥掉文档注释——
 * 注释里为了说明「删了什么」反而写着那些名字。
 */

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}

const pageSource = stripComments(
  (
    (import.meta.glob('./PuzzleEditorPage.tsx', {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>)['./PuzzleEditorPage.tsx'] ?? ''
  ).replace(/\r\n/g, '\n'),
);

const barSource = stripComments(
  (
    (import.meta.glob('../components/puzzle/PuzzleBottomBar.tsx', {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>)['../components/puzzle/PuzzleBottomBar.tsx'] ?? ''
  ).replace(/\r\n/g, '\n'),
);

const leftPanelSource = stripComments(
  (
    (import.meta.glob('../components/puzzle/PuzzleEditorLeftPanel.tsx', {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>)['../components/puzzle/PuzzleEditorLeftPanel.tsx'] ?? ''
  ).replace(/\r\n/g, '\n'),
);

describe('PuzzleBottomBar（SPEC-K07 §4.4）', () => {
  it('drops every canvas-writing tool', () => {
    // 选择 / 区域 / 物品 / 橡皮擦 一个都不在（注释已剥）。
    expect(barSource).not.toContain('选择');
    expect(barSource).not.toContain('区域');
    expect(barSource).not.toContain('物品');
    expect(barSource).not.toContain('橡皮擦');
    expect(barSource).not.toContain('onOpenResize');
    expect(barSource).not.toContain('SHAPES');
    expect(barSource).not.toContain('activeTool');
  });

  it('shows the size as a plain span — no click, no hover state', () => {
    expect(barSource).toContain('data-testid="puzzle-canvas-size"');
    const span = barSource.slice(
      barSource.indexOf('data-testid="puzzle-canvas-size"'),
      barSource.indexOf('</span>', barSource.indexOf('data-testid="puzzle-canvas-size"')),
    );
    expect(span).not.toContain('onClick');
    expect(span).not.toContain('hover:');
    expect(span).toContain('title="画布尺寸由所选地图版本决定，不可修改"');
  });

  it('keeps the view-only cluster: ruler / zoom / undo / redo', () => {
    expect(barSource).toContain('title="显示 / 隐藏标尺"');
    expect(barSource).toContain('title="撤销 (Ctrl+Z)"');
    expect(barSource).toContain('title="重做 (Ctrl+Shift+Z)"');
    expect(barSource).toContain('onZoomIn');
    expect(barSource).toContain('onFit');
  });
});

describe('PuzzleEditorPage toolbar（Q17：发布只属于地图模块）', () => {
  it('renders the toolbar without a publish button', () => {
    const toolbar = pageSource.slice(
      pageSource.indexOf('<EditorToolbar'),
      pageSource.indexOf('/>', pageSource.indexOf('<EditorToolbar')),
    );
    expect(toolbar).toContain('onSave={save}');
    expect(toolbar).toContain('onBack={() => navigate(\'/puzzles\')}');
    expect(toolbar).toContain('infoTitle="谜题基本信息（描述、联动主题色）"');
    // 没有 onPublish / onOpenVersions —— 版本管理在地图编辑器里做。
    expect(toolbar).not.toContain('onPublish');
    expect(toolbar).not.toContain('onOpenVersions');
    expect(toolbar).toContain('publishing={false}');
    // 整页也没有发布确认弹窗的残留。
    expect(pageSource).not.toContain('publishOpen');
    expect(pageSource).not.toContain('openPublishConfirm');
  });

  it('has no 「调整画布尺寸」 dialog anywhere on this screen', () => {
    expect(pageSource).not.toContain('调整画布尺寸');
    expect(pageSource).not.toContain('resizeOpen');
    expect(pageSource).not.toContain('onOpenResize');
  });
});

describe('PuzzleEditorPage left panel（SPEC-K12 §4.1）', () => {
  it('renders the puzzle left panel — the map editor’s panel never appears', () => {
    expect(pageSource).toContain('<PuzzleEditorLeftPanel');
    // 注意不能用裸子串：`PuzzleEditorLeftPanel` 自身包含 `EditorLeftPanel`。
    expect(pageSource).not.toContain('<EditorLeftPanel');
    expect(pageSource).not.toContain("from '@/components/editor/EditorLeftPanel'");
  });

  it('keeps the 角色 tab only — no TABS switcher, no 物品 / 区域', () => {
    expect(leftPanelSource).not.toContain('const TABS');
    expect(leftPanelSource).not.toContain('物品');
    expect(leftPanelSource).not.toContain('区域');
    // 「角色」是面板唯一的标题。
    expect(leftPanelSource).toContain('角色');
    // 写地图的回调一个都不在。
    expect(leftPanelSource).not.toContain('onSetLayer');
    expect(leftPanelSource).not.toContain('onSelectItem');
    expect(leftPanelSource).not.toContain('onSelectRegion');
    expect(leftPanelSource).not.toContain('onEditRegion');
    expect(leftPanelSource).not.toContain('onDeleteRegion');
  });
});

describe('PuzzleEditorPage canvas（SPEC-K12 §5.1：只读参考画布）', () => {
  it('pins the tool to select and neuters every write handler', () => {
    expect(pageSource).toContain('activeTool="select"');
    expect(pageSource).toContain('pendingItem={null}');
    expect(pageSource).toContain('regionDraftSelection={new Set<string>()}');
    expect(pageSource).toContain('onPlaceItem={() => undefined}');
    expect(pageSource).toContain('onErase={() => undefined}');
    expect(pageSource).toContain('onDraftAdd={() => undefined}');
    expect(pageSource).toContain('onDraftRemove={() => undefined}');
    expect(pageSource).toContain('onDraftClear={() => undefined}');
    expect(pageSource).toContain('onToggleRegionCell={() => undefined}');
    expect(pageSource).toContain('onAnchorChange={() => undefined}');
    // 参与者拖拽 / 清空槽位仍可写（那是谜题自己的数据，不是地图）。
    expect(pageSource).toContain('beginSlotDrag');
  });

  it('keeps no map-writing keyboard shortcuts (V / R / E / Delete)', () => {
    // 只保留 Ctrl+S / Space / Ctrl+Z / Ctrl+Shift+Z / Ctrl+0 / Esc / 方向键。
    expect(pageSource).not.toMatch(/event\.key === 'v'/i);
    expect(pageSource).not.toMatch(/event\.key === 'r'/i);
    expect(pageSource).not.toMatch(/event\.key === 'e'/i);
    expect(pageSource).not.toContain("'Delete'");
    expect(pageSource).not.toContain("'Backspace'");
  });
});
