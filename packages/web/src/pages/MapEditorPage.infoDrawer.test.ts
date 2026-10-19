import { describe, expect, it } from 'vitest';
import { readSource } from '@/testing/source';

/**
 * v0.4.0 BUG-G01 (docs/v0.4.0.md §1) + v0.5.0 SPEC-K12（docs/v0.5.0.md §9.1）。
 *
 * Clicking a cell writes **both** `selection` and `selectedRegionId`
 * (`EditorCanvas.selectCellAt`), while the 「地图基本信息」handler only used to
 * clear the former two of the three focus axes — so the effect that mirrors
 * "any axis is non-null" re-opened the (empty) info drawer right after the
 * basic-info drawer closed.
 *
 * 焦点轴只剩方格与区域两条，`infoDrawerOpen` 的 `selectedSlotIndex` 恒为 `null`。
 *
 * Rendering `MapEditorPage` needs a query client, a router and a seeded store, so
 * — like `MapEditorPage.autoSave.test.ts` — these are source-level assertions on
 * the wiring itself.
 */

const pageSource = readSource('pages/MapEditorPage.tsx');

describe('MapEditorPage (BUG-G01)', () => {
  it('clears every focus axis when the basic-info drawer opens', () => {
    const handler = pageSource.slice(
      pageSource.indexOf('onOpenMapInfo={() => {'),
      pageSource.indexOf('onExport={exportToFile}'),
    );
    expect(handler).toContain('editor.setSelection(null);');
    expect(handler).toContain('editor.setSelectedRegion(null);');
    expect(handler).toContain('setInfoOpen(false);');
    expect(pageSource).not.toContain('setSelectedSlot');
  });

  it('the info-drawer effect bails out while the basic-info drawer is open', () => {
    expect(pageSource).toContain('if (mapInfoOpen) {');
    expect(pageSource).toContain('mapInfoOpen,');
  });

  it('leaving the basic-info drawer for another focus closes it first', () => {
    // 验收补充：抽屉开着时点方格 / 区域标签，必须先关掉基本信息抽屉，
    // 信息框才能接管——否则它会一直压在上面，直到用户手动关闭。
    const guard = pageSource.slice(
      pageSource.indexOf('const guardMapInfo ='),
      pageSource.indexOf('const commitMapInfo ='),
    );
    expect(guard).toContain('if (!mapInfoOpen) {');
    expect(guard).toContain('setMapInfoOpen(false);');
    expect(guard).toContain('proceed();');
    expect(guard).toContain('setPendingMapInfoAction(() => proceed);');
  });

  it('cell / region clicks all leave through the guard', () => {
    const canvas = pageSource.slice(
      pageSource.indexOf('onSelect={(selection) => {'),
      pageSource.indexOf('onSelectRegion={(regionId) => {'),
    );
    expect(canvas).toContain('guardMapInfo(() => editor.setSelection(selection));');
    const region = pageSource.slice(
      pageSource.indexOf('onSelectRegion={(regionId) => {'),
      pageSource.indexOf('onAnchorChange='),
    );
    expect(region).toContain('guardMapInfo(() => editor.setSelectedRegion(regionId));');
  });

  it('the drawer open state comes from the shared pure function', () => {
    expect(pageSource).toContain('open={infoDrawerOpen({');
    expect(pageSource).toContain('infoOpen,');
    expect(pageSource).toContain('selectedSlotIndex: null');
    expect(pageSource).not.toContain('selectedSlotIndex: editor.selectedSlotIndex');
  });

  it('drops every participant prop from the map editor (SPEC-K12 §9.1)', () => {
    // 地图编辑器里不应再出现参与者花名册 / 参与者抽屉 / 联动高亮。
    expect(pageSource).not.toContain('ParticipantPanel');
    expect(pageSource).not.toContain('ParticipantDrawer');
    expect(pageSource).not.toContain('onActivateClick');
    expect(pageSource).toContain('highlight={null}');
  });
});

/**
 * OPT-H10（docs/v0.4.2.md §10）：方格信息里的区域信息是**只读卡片**。
 *
 * 三个按钮（编辑 / 定位 / 删除）在方格上下文里是冗余的 —— 「编辑」「删除」在左侧
 * 「区域」标签的列表里已有，「定位」在「我点的是格子」这个语境下语义不明。
 * 选中区域本身（区域分支）时它们仍然可用。
 *
 * v0.5.0 SPEC-K12 §4.2 进一步把方格分支的操作按钮全部去掉（readOnly 时连
 * 「清空本格 / 清空物品层」也不渲染）——谜题编辑器的只读信息框复用同一组件。
 */
const drawerSource = readSource('components/map-editor/EditorInfoDrawer.tsx');

describe('EditorInfoDrawer 方格分支的区域信息（OPT-H10 §10.2）', () => {
  it('makes the region actions an optional argument of the shared section', () => {
    expect(drawerSource).toContain('actions?: RegionActionHandlers;');
    expect(drawerSource).toContain('{actions ? <RegionActions region={region} actions={actions} /> : null}');
    expect(drawerSource).toContain('interface RegionActionHandlers {');
  });

  it('the cell branch renders the region as read-only context', () => {
    const cellBranch = drawerSource.slice(
      drawerSource.indexOf('function CellBranch({'),
      drawerSource.indexOf('export function EditorInfoDrawer({'),
    );
    expect(cellBranch).toContain('<RegionSection region={region} />');
    expect(cellBranch).not.toContain('actions=');
    expect(cellBranch).not.toContain('RegionActions');
    expect(cellBranch).toContain('readOnly ? null : (');
  });

  it('the region branch keeps its three actions', () => {
    const regionBranch = drawerSource.slice(
      drawerSource.indexOf(") : selection.type === 'cell' ? ("),
      drawerSource.indexOf('</div>\n        </div>\n      </aside>'),
    );
    expect(regionBranch).toContain('onEdit: onEditRegion,');
    expect(regionBranch).toContain('onDelete: onDeleteRegion,');
    expect(regionBranch).toContain('onLocate: onLocateRegion,');
    // 三个按钮本体仍然存在（只是方格分支不渲染它们）。
    expect(drawerSource).toContain('onClick={() => actions.onEdit(region)}');
    expect(drawerSource).toContain('onClick={() => actions.onLocate(region)}');
    expect(drawerSource).toContain('onClick={() => actions.onDelete(region)}');
  });

  it('re-lays the block: bordered card, percentage fill', () => {
    const info = drawerSource.slice(
      drawerSource.indexOf('function RegionInfo('),
      drawerSource.indexOf('interface RegionActionHandlers'),
    );
    expect(info).toContain('rounded-md border bg-muted/30 px-3 py-2');
    expect(info).toContain('Math.round(region.fillOpacity * 100)');
    expect(info).not.toMatch(/font-mono[^`]*\{region\.id\}/);
  });
});
