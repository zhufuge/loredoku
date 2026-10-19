import { describe, expect, it } from 'vitest';
import { readSource } from '@/testing/source';

/**
 * OPT-H11（docs/v0.4.2.md §11）：底栏工具条没有「放置角色」按钮。
 *
 * CLAR-603 之后角色**不进入地图**，放置参与者的路径是
 * 「左侧角色标签 → 加入 → 拖到参与者区」，与画布无关。
 *
 * `EditorTool` 联合类型仍然包含 `'character'`（§17 Q8：保留类型，避免牵动
 * store / schema / 扩展点），被移除的只是 UI 入口与快捷键提示。
 */

const barSource = readSource('components/map-editor/EditorBottomBar.tsx');

const pageSource = readSource('pages/MapEditorPage.tsx');

const leftPanelSource = readSource('components/map-editor/EditorLeftPanel.tsx');

describe('EditorBottomBar tools (OPT-H11 §11.2)', () => {
  it('drops the character tool entry', () => {
    const tools = barSource.slice(barSource.indexOf('const TOOLS'), barSource.indexOf('const SHAPES'));
    expect(tools).not.toContain("id: 'character'");
    // The icon went with it — no dead import left behind.
    expect(barSource).not.toContain('User');
  });

  it('keeps exactly the three real tools, in order', () => {
    const tools = barSource.slice(barSource.indexOf('const TOOLS'), barSource.indexOf('const SHAPES'));
    const ids = Array.from(tools.matchAll(/id: '(\w+)'/g)).map((match) => match[1]);
    expect(ids).toEqual(['select', 'region', 'eraser']);
  });

  it('leaves the region-shape cluster untouched', () => {
    expect(barSource).toContain("{ id: 'rect', label: '矩形'");
    expect(barSource).toContain("{ id: 'brush', label: '自由笔刷'");
  });

  it('keeps the size button clickable on the map side (SPEC-K12 回归)', () => {
    // 谜题侧把尺寸降级成纯展示，这里钉住地图侧没有跟着降级。
    const sizeAt = barSource.indexOf('onClick={onOpenResize}');
    expect(sizeAt).toBeGreaterThan(-1);
    const sizeButton = barSource.slice(barSource.lastIndexOf('<Button', sizeAt), sizeAt);
    expect(barSource).toContain('onOpenResize: () => void;');
  });
});

describe('MapEditorPage keyboard shortcuts (OPT-H11 §11.3)', () => {
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
  it('keeps only the items / regions tabs — the roster moved to the puzzle editor', () => {
    const tabs = leftPanelSource.slice(
      leftPanelSource.indexOf('const TABS'),
      leftPanelSource.indexOf('const LAYER_LABELS'),
    );
    const ids = Array.from(tabs.matchAll(/id: '(\w+)'/g)).map((match) => match[1]);
    expect(ids).toEqual(['assets', 'regions']);
    // SPEC-K04: the roster's whole branch (and its props) left with it.
    expect(leftPanelSource).not.toContain('characterSlots');
    expect(leftPanelSource).not.toContain('selectedCharacterId');
    expect(leftPanelSource).not.toContain('onAssignSlot');
    expect(leftPanelSource).not.toContain('onSelectCharacter');
  });
});
