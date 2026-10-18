import { describe, expect, it } from 'vitest';
import { readSource } from '@/testing/source';

/**
 * v0.3.10 FIX-F01 / FIX-F03 (docs/v0.3.10.md §1 / §3).
 *
 * `EditorPage` owns the wiring that makes 「地图基本信息」 a single, complete
 * form: the drawer commits the style **and** the canvas size, and a project
 * whose basics were never persisted gets one implicit save on first entry.
 *
 * v0.5.6: the single writer moved into `useEditorSave` (both editors share
 * it); the page supplies the payload builder and the post-save bookkeeping.
 *
 * Rendering the page needs a query client, a router and a store seeded with a
 * project, so — like `EditorCanvas.noDrag.test.ts` — these are source-level
 * assertions on the wiring itself.
 */

const pageSource = readSource('pages/EditorPage.tsx');

const saveHookSource = readSource('hooks/useEditorSave.ts');

const resizeHookSource = readSource('hooks/useEditorResize.ts');

describe('EditorPage (FIX-F01 / FIX-F03)', () => {
  it('FIX-F01: the drawer commits the style and the canvas size together', () => {
    expect(pageSource).toContain('const commitMapInfo = (next: MapStyle, nextGridSize: number)');
    // The size is applied locally (undoable) and then persisted with the style.
    expect(pageSource).toContain('if (gridSizeChanged) editor.setGridSize(nextGridSize);');
    // The drawer no longer owns a resize side channel.
    expect(pageSource).not.toContain('onRequestResize');
  });

  it('FIX-F01: one code path persists the whole draft', () => {
    // `persist` is the single writer; both the toolbar and the drawer use it.
    expect(saveHookSource).toContain('const persist = async (): Promise<boolean> => {');
    // The page builds the payload from the live store, not from a snapshot.
    expect(pageSource).toContain('buildPayload: () => ({ data: editor.toDraft(), updatedAt: editor.updatedAt })');
    // A dirty canvas is saved before the server-side resize re-seeds it.
    expect(resizeHookSource).toContain('if (dirty) await persist();');
  });

  it('v0.5.8 §3: entering the editor never triggers a save by itself', () => {
    // FIX-F03 的「首次进入自动保存」整条移除：它在快速点击同一条目时会跟着
    // query 失效反复触发，写出一连串草稿修订。现在进编辑器只 init，不写。
    expect(pageSource).not.toContain('basicInfoPersistedRef');
    expect(pageSource).not.toContain('已保存默认地图基本信息');
    expect(pageSource).not.toContain('useEditorStore.getState()');
    // 未初始化的地图走初始化弹窗，那两条出路都是用户显式动作。v0.5.8 §13:
    // fork 态（`?v=`）跳过这条 —— 画布来自版本快照，与草稿初始化与否无关。
    expect(pageSource).toContain('if (forkFrom === null && mapQuery.data?.draft == null) {');
    expect(pageSource).toContain('<MapInitDialog');
    expect(pageSource).toContain('onInitSize={handleInitSize}');
    expect(pageSource).toContain('onImport={handleInitImport}');
  });

  it('v0.5.8 §3: an uninitialised draft is never fed to editor.init', () => {
    expect(pageSource).toContain('if (data.draft === null) return;');
  });
});
