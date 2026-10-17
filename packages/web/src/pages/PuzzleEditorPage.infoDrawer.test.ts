import { describe, expect, it } from 'vitest';
import { readSource } from '@/testing/source';

/**
 * SPEC-K12 §4.2 / §15 Q1（docs/v0.5.0.md）：谜题编辑器的格子信息弹框是**只读**的。
 *
 * 画布是被引用地图版本的参考视图，任何「清除 / 编辑 / 删除」在这里都没有意义
 * （改了也不会写进地图版本），所以 `EditorInfoDrawer` 以 `readOnly` 渲染：
 * 方格分支连「清空本格 / 清空物件层」都不出现，区域分支不渲染
 * 编辑 / 定位 / 删除。页面同时把所有写回调接成 `() => undefined` —— 双保险，
 * 断言两侧都要看。
 */

const pageSource = readSource('pages/PuzzleEditorPage.tsx');

const drawerSource = readSource('components/editor/EditorInfoDrawer.tsx');

describe('PuzzleEditorPage 只读信息弹框（SPEC-K12 §4.2）', () => {
  it('renders the shared drawer in read-only mode', () => {
    const drawer = pageSource.slice(
      pageSource.indexOf('<EditorInfoDrawer'),
      pageSource.indexOf('/>', pageSource.indexOf('<EditorInfoDrawer')),
    );
    expect(drawer).toContain('open={infoDrawerOpen({');
    expect(drawer).toContain('selection={puzzle.selection}');
    expect(drawer).toContain('readOnly');
    // 打开态来自共享纯函数：信息框 / 基本信息 / 参与者三轴。
    expect(drawer).toContain('infoOpen,');
    expect(drawer).toContain('mapInfoOpen: puzzleInfoOpen,');
    expect(drawer).toContain('selectedSlotIndex: puzzle.selectedSlotIndex,');
  });

  it('neutered every write callback the drawer could call', () => {
    expect(pageSource).toContain('onClearCell={() => undefined}');
    expect(pageSource).toContain('onClearObject={() => undefined}');
    expect(pageSource).toContain('onEditRegion={() => undefined}');
    expect(pageSource).toContain('onDeleteRegion={() => undefined}');
    // 定位是查看动作（居中），保留实现。
    expect(pageSource).toContain('onLocateRegion={() => canvasRef.current?.centerView()}');
  });

  it('the cell branch shows no 快捷操作 block at all', () => {
    // `readOnly ? null : (…)` 把整段快捷操作（清空本格 / 清空物件层）摘掉。
    expect(drawerSource).toContain('readOnly ? null : (');
    const cellBranch = drawerSource.slice(
      drawerSource.indexOf('function CellBranch({'),
      drawerSource.indexOf('export function EditorInfoDrawer({'),
    );
    expect(cellBranch).toContain('readOnly = false,');
    expect(cellBranch).toContain('<RegionSection region={region} />');
    expect(cellBranch).not.toContain('actions=');
  });

  it('the region branch passes no actions when read-only', () => {
    // 区域分支：`actions={readOnly ? undefined : {…}}`（源码里折行，逐段断言）。
    const main = drawerSource.slice(
      drawerSource.indexOf(") : selection.type === 'cell' ? ("),
      drawerSource.indexOf('</aside>'),
    );
    expect(main).toContain('<RegionSection');
    expect(main).toContain('? undefined');
    expect(main).toContain('onEdit: onEditRegion,');
    expect(main).toContain('onDelete: onDeleteRegion,');
    expect(main).toContain('onLocate: onLocateRegion,');
    // 三个按钮本体仍在组件里（地图编辑器需要），但 readOnly 时不可达。
    expect(drawerSource).toContain('onClick={() => actions.onEdit(region)}');
    expect(drawerSource).toContain('onClick={() => actions.onLocate(region)}');
    expect(drawerSource).toContain('onClick={() => actions.onDelete(region)}');
  });

  it('keeps the read-only detail: coordinates and the region as context', () => {
    const cellBranch = drawerSource.slice(
      drawerSource.indexOf('function CellBranch({'),
      drawerSource.indexOf('export function EditorInfoDrawer({'),
    );
    expect(cellBranch).toContain('C{selection.x + 1} R{selection.y + 1}');
    // 区域信息整段交给共享的 RegionSection（只读上下文）。
    expect(cellBranch).toContain('<RegionSection region={region} />');
  });
});
