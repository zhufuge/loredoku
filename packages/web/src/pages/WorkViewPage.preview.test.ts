import { describe, expect, it } from 'vitest';

/**
 * v0.3.10 FIX-F07 / FEAT-F01 / FEAT-F02 (docs/v0.3.10.md §8 ~ §10).
 *
 * The work preview reuses the editor's participant panel and ruler strips, and
 * its adaptive pass reserves the bands the strips actually occupy. These are
 * source-level assertions, the same technique as `EditorCanvas.noDrag.test.ts`
 * — the components need a live query client to render, and the rule being
 * protected is architectural ("do not fork the implementation again").
 */

const pageSource =
  (import.meta.glob('./WorkViewPage.tsx', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>)['./WorkViewPage.tsx'] ?? '';

const panelSource =
  (import.meta.glob('../components/editor/ParticipantPanel.tsx', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>)['../components/editor/ParticipantPanel.tsx'] ?? '';

const rulerSource =
  (import.meta.glob('../components/map/MapRulerStrips.tsx', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>)['../components/map/MapRulerStrips.tsx'] ?? '';

describe('WorkViewPage (FIX-F07 / FEAT-F01 / FEAT-F02)', () => {
  it('FIX-F07: the roster is the editor ParticipantPanel, read-only', () => {
    expect(pageSource).toContain('<ParticipantPanel');
    expect(pageSource).toContain('readOnly');
    // The preview keeps its own single-active state machine (MOD-802).
    expect(pageSource).toContain('reduceLinkageActivation');
    expect(pageSource).toContain("onActivateClick={(index) => handleActivation(");
    // The hand-rolled vertical list is gone.
    expect(pageSource).not.toContain('参与者框 #');
    expect(pageSource).not.toContain('GenderBadge');
  });

  it('FIX-F07: read-only mode registers no drag and renders no × button', () => {
    // `setPointerCapture` is only reached when `readOnly` is false.
    const pointerDown = segment(panelSource, 'onPointerDown={(event) => {', 'onPointerMove=');
    expect(pointerDown).toContain('if (readOnly) return;');
    expect(pointerDown).toContain('setPointerCapture');
    // The × button is guarded by `!readOnly && slot`.
    expect(panelSource).toContain('{!readOnly && slot ? (');
    expect(panelSource).toContain("'该作品暂无参与者'");
  });

  it('FEAT-F01: the preview renders the shared ruler strips', () => {
    expect(pageSource).toContain('<MapRulerStrips');
    // The preview has no operation cursor box, so the prop stays at its
    // `null` default rather than being passed explicitly.
    expect(pageSource).not.toContain('operationCell=');
    expect(rulerSource).toContain('buildRulerGlyphs');
    expect(rulerSource).toContain('rulerStripSize');
  });

  it('FEAT-F01: the toggle is persisted under murdoku.workview.ruler', () => {
    expect(pageSource).toContain("const RULER_STORAGE_KEY = 'murdoku.workview.ruler'");
    expect(pageSource).toContain("title=\"显示 / 隐藏标尺\"");
    expect(pageSource).toContain("!== 'hidden'");
  });

  it('FEAT-F02: the adaptive pass reserves the ruler bands', () => {
    const fit = segment(pageSource, 'const fit = useCallback', 'const fitRef');
    expect(fit).toContain('canvasInsets({');
    expect(fit).toContain('showRulers,');
    expect(fit).toContain('showBottomBar: false,');
    expect(fit).toContain('rulerSize: rulerStrip,');
    // No page-level constants override the snapshot's style.
    expect(pageSource).toContain('effectiveCellSize(autoCellSize, style)');
  });

  it('FEAT-F02: the strip thickness comes from style.ruler', () => {
    expect(pageSource).toContain('rulerStripSize({ maxFontSize: rulerMaxFont, gap: style.ruler.gap })');
    expect(pageSource).toContain('style.ruler.fontSize + RULER_ACTIVE_FONT_DELTA');
  });
});

// ---- OPT-G01 (docs/v0.4.0.md §2): the title is the map name ----
describe('WorkViewPage (OPT-G01)', () => {
  it('titles the page with the map name and badges the version', () => {
    // The publish notes no longer occupy the title slot.
    expect(pageSource).toContain('detailQuery.data?.projectName');
    expect(pageSource).not.toContain("detailQuery.data?.notes ?? '作品'");
    // The version is rendered as a badge next to the title.
    const header = segment(pageSource, '<header className=', '</header>');
    expect(header).toContain('v{versionNo}');
  });

  it('shows the notes as secondary text instead of the title', () => {
    expect(pageSource).toContain('detailQuery.data?.notes ? (');
    expect(pageSource).toContain('<p className="truncate text-xs text-muted-foreground">');
  });

  it('the browser tab is titled with the map name', () => {
    expect(pageSource).toContain('document.title = name ? `${name} · Murdoku Maker`');
  });
});

/** Text between two markers (both must exist). */
function segment(haystack: string, startMarker: string, endMarker: string): string {
  const start = haystack.indexOf(startMarker);
  const end = haystack.indexOf(endMarker, start);
  if (start === -1 || end === -1) {
    throw new Error(`segment not found: ${startMarker}`);
  }
  return haystack.slice(start, end);
}
