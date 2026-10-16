import { describe, expect, it } from 'vitest';

/**
 * v0.4.0 BUG-G01 (docs/v0.4.0.md §1).
 *
 * Clicking a cell writes **both** `selection` and `selectedRegionId`
 * (`EditorCanvas.selectCellAt`), while the 「地图基本信息」handler only used to
 * clear the former two of the three focus axes — so the effect that mirrors
 * "any axis is non-null" re-opened the (empty) info drawer right after the
 * basic-info drawer closed.
 *
 * Rendering `EditorPage` needs a query client, a router and a seeded store, so
 * — like `EditorPage.autoSave.test.ts` — these are source-level assertions on
 * the wiring itself.
 */

const pageSource =
  (import.meta.glob('./EditorPage.tsx', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>)['./EditorPage.tsx'] ?? '';

describe('EditorPage (BUG-G01)', () => {
  it('clears every focus axis when the basic-info drawer opens', () => {
    const handler = pageSource.slice(
      pageSource.indexOf('onOpenMapInfo={() => {'),
      pageSource.indexOf('onExport={exportToFile}'),
    );
    expect(handler).toContain('editor.setSelection(null);');
    expect(handler).toContain('editor.setSelectedRegion(null);');
    expect(handler).toContain('editor.setSelectedSlot(null);');
    expect(handler).toContain('setInfoOpen(false);');
  });

  it('the info-drawer effect bails out while the basic-info drawer is open', () => {
    expect(pageSource).toContain('if (mapInfoOpen) {');
    expect(pageSource).toContain('mapInfoOpen,');
  });

  it('leaving the basic-info drawer for another focus closes it first', () => {
    // 验收补充：抽屉开着时点方格 / 参与者 / 区域标签，必须先关掉基本信息抽屉，
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

  it('cell / participant / region clicks all leave through the guard', () => {
    const canvas = pageSource.slice(
      pageSource.indexOf('onSelect={(selection) => {'),
      pageSource.indexOf('onSelectRegion={(regionId) => {'),
    );
    expect(canvas).toContain('guardMapInfo(() => {');
    const roster = pageSource.slice(
      pageSource.indexOf('onActivateClick={(index) => {'),
      pageSource.indexOf('onClearRequest={clearSlot}'),
    );
    expect(roster).toContain('guardMapInfo(() => {');
    const region = pageSource.slice(
      pageSource.indexOf('onSelectRegion={(regionId) => {'),
      pageSource.indexOf('onAnchorChange='),
    );
    expect(region).toContain('guardMapInfo(() => editor.setSelectedRegion(regionId));');
  });

  it('the drawer open state comes from the shared pure function', () => {
    expect(pageSource).toContain('open={infoDrawerOpen({');
    expect(pageSource).toContain('infoOpen,');
    expect(pageSource).toContain('selectedSlotIndex: editor.selectedSlotIndex,');
    expect(pageSource).not.toContain('open={infoOpen && editor.selectedSlotIndex === null}');
  });
});

/**
 * OPT-H10（docs/v0.4.2.md §10）：方格信息里的区域信息改成**只读卡片**。
 *
 * 三个按钮（编辑 / 定位 / 删除）在方格上下文里是冗余的 —— 「编辑」「删除」在左侧
 * 「区域」标签的列表里已有，「定位」在「我点的是格子」这个语境下语义不明。
 * 选中区域本身（区域分支）时它们仍然可用。
 */
const drawerSource =
  ((import.meta.glob('../components/editor/EditorInfoDrawer.tsx', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>)['../components/editor/EditorInfoDrawer.tsx'] ?? '').replace(
    /\r\n/g,
    '\n',
  );

describe('EditorInfoDrawer 方格分支的区域信息（OPT-H10 §10.2）', () => {
  it('makes the region actions an optional argument of the shared section', () => {
    expect(drawerSource).toContain('actions?: RegionActionHandlers;');
    expect(drawerSource).toContain('{actions ? <RegionActions region={region} actions={actions} /> : null}');
    expect(drawerSource).toContain('interface RegionActionHandlers {');
  });

  it('the cell branch renders the region as read-only context', () => {
    const cellBranch = drawerSource.slice(
      drawerSource.indexOf('function CellBranch({'),
      drawerSource.indexOf('function CharacterProfile('),
    );
    expect(cellBranch).toContain('<RegionSection region={region} />');
    expect(cellBranch).not.toContain('actions=');
    expect(cellBranch).not.toContain('RegionActions');
    // 清空本格 / 清空物件层 不变的既有快捷操作。
    expect(cellBranch).toContain('清空本格');
    expect(cellBranch).toContain('清空物件层');
  });

  it('the region branch keeps 编辑 / 定位 / 删除', () => {
    const regionBranch = drawerSource.slice(
      drawerSource.indexOf(') : selection.type === \'cell\' ? ('),
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

  it('re-lays the block: bordered card, 包含 N 格 badge, one-line attributes', () => {
    const info = drawerSource.slice(
      drawerSource.indexOf('function RegionInfo('),
      drawerSource.indexOf('interface RegionActionHandlers'),
    );
    expect(info).toContain('rounded-md border bg-muted/30 px-3 py-2');
    expect(info).toContain('包含 {region.cells.length} 格');
    expect(info).toContain('<dt>边界线宽</dt>');
    expect(info).toContain('<dt>填充</dt>');
    // 填充按百分比渲染，而不是裸的 0~1 小数。
    expect(info).toContain('Math.round(region.fillOpacity * 100)');
    // 完整 region id 退到 title，不再挤占区域名称。
    expect(info).toContain('title={`区域 ID：${regionId}`}');
    expect(info).not.toMatch(/font-mono[^`]*\{region\.id\}/);
  });
});
