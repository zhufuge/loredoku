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
