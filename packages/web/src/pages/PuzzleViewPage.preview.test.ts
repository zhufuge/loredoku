import { describe, expect, it } from 'vitest';
import { codeOf, readSource } from '@/testing/source';

/**
 * v0.5.0 SPEC-K05（docs/v0.5.0.md §3）：谜题预览页。
 *
 * 数据源：格子 / 区域 / 样式来自 `usePuzzleMapContext`，参与者与联动主题色来自
 * 谜题自己的 `PuzzleDraft`（Q16：调色板归谜题持有，`resolveMapStyle` 不产出
 * `linkageColors`）。画布是只读的 —— 没有任何写回调，布局 / 标尺 / hover
 * affordance / 只读参与者面板保持原样。
 */

const pageSource = readSource('pages/PuzzleViewPage.tsx');

const routerSource = codeOf('router.tsx');

describe('PuzzleViewPage data sources（SPEC-K05 §3）', () => {
  it('loads the puzzle and its referenced map version context', () => {
    expect(pageSource).toContain('import { usePuzzle, usePuzzleMapContext } from \'@/hooks/usePuzzles\';');
    expect(pageSource).toContain('const detailQuery = usePuzzle(valid ? id : null);');
    expect(pageSource).toContain('const mapQuery = usePuzzleMapContext(valid ? id : null);');
  });

  it('takes the board (cells / regions / style) from the map context', () => {
    expect(pageSource).toContain('const regions = useMemo(() => mapContext?.regions ?? [], [mapContext]);');
    expect(pageSource).toContain('const gridSize = mapContext?.gridSize ?? 0;');
    expect(pageSource).toContain('const style = useMemo(() => resolveMapStyle(mapContext?.style), [mapContext]);');
  });

  it('takes participants and the linkage palette from the puzzle draft (Q16)', () => {
    expect(pageSource).toContain('draft?.characterSlots ?? [],');
    expect(pageSource).toContain('const linkageColors = useMemo(() => draft?.linkageColors ?? [], [draft]);');
    expect(pageSource).toContain('linkageColors,');
    const highlightCall = pageSource.slice(
      pageSource.indexOf('resolveHighlight(activeSlot.linkages, {'),
      pageSource.indexOf('}, [activeSlot, gridSize, cells, slots, regions, style, linkageColors'),
    );
    expect(highlightCall).toContain('linkageColors,');
  });
});

describe('PuzzleViewPage is read-only', () => {
  it('has no canvas-writing handler at all', () => {
    // 页面直接铺 MapLayers（不走 EditorCanvas），所以不存在写回调。
    expect(pageSource).not.toContain('onErase');
    expect(pageSource).not.toContain('onPlaceItem');
    expect(pageSource).not.toContain('onClearCell');
    expect(pageSource).not.toContain('onClearObject');
    expect(pageSource).not.toContain('onEditRegion');
    expect(pageSource).not.toContain('onDeleteRegion');
    expect(pageSource).not.toContain('onDraftAdd');
    expect(pageSource).not.toContain('EditorCanvas');
  });

  it('keeps the read-only participant panel', () => {
    const panel = pageSource.slice(
      pageSource.indexOf('<ParticipantPanel'),
      pageSource.indexOf('/>', pageSource.indexOf('<ParticipantPanel')),
    );
    expect(panel).toContain('slots={slots}');
    expect(panel).toContain('readOnly');
  });

  it('keeps the shared layer stack, rulers and hover affordances', () => {
    expect(pageSource).toContain('<MapBackgroundLayer');
    expect(pageSource).toContain('<MapHighlightLayer');
    expect(pageSource).toContain('<MapItemLayer');
    expect(pageSource).toContain('<MapRegionLabelLayer');
    expect(pageSource).toContain('MapRulerStrips');
    expect(pageSource).toContain('resolveHoverEffects({ hover, blockingCells, itemCells, regions })');
    // OPT-A01：自适应格宽 + 手动缩放后停止自动重排。
    expect(pageSource).toContain('computeCellSizeForInsets');
    expect(pageSource).toContain('userAdjustedRef');
  });
});

describe('PuzzleViewPage routing', () => {
  it('lives at /puzzles/:puzzleId/view and titles the tab after the puzzle', () => {
    expect(routerSource).toContain("path: '/puzzles/:puzzleId/view',");
    expect(routerSource).toContain('element: <PuzzleViewPage />');
    expect(routerSource).not.toContain('/works');
    expect(pageSource).toContain("document.title = name ? `${name} · 格物` : '谜题预览 · 格物';");
  });

  it('labels the header with the referenced map version', () => {
    expect(pageSource).toContain('const mapVersionNo = detailQuery.data?.mapVersionNo ?? mapContext.versionNo;');
    expect(pageSource).toContain('v{mapVersionNo}');
  });
});
