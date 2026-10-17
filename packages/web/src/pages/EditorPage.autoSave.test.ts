import { describe, expect, it } from 'vitest';
import { readSource } from '@/testing/source';

/**
 * v0.3.10 FIX-F01 / FIX-F03 (docs/v0.3.10.md §1 / §3).
 *
 * `EditorPage` owns the wiring that makes 「地图基本信息」 a single, complete
 * form: the drawer commits the style **and** the canvas size, and a project
 * whose basics were never persisted gets one implicit save on first entry.
 *
 * Rendering the page needs a query client, a router and a store seeded with a
 * project, so — like `EditorCanvas.noDrag.test.ts` — these are source-level
 * assertions on the wiring itself.
 */

const pageSource = readSource('pages/EditorPage.tsx');

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
    expect(pageSource).toContain('const persist = async (): Promise<boolean> =>');
    expect(pageSource).toContain('payload: { data: editor.toDraft(), updatedAt: editor.updatedAt }');
    expect(pageSource).toContain('if (editor.dirty) await persist();');
  });

  it('FIX-F03: a never-persisted draft is saved once on first entry', () => {
    expect(pageSource).toContain('basicInfoPersistedRef');
    expect(pageSource).toContain('if (data.draft.style == null && basicInfoPersistedRef.current !== id)');
    // Guarded by the dirty flag — never clobbers work in progress.
    expect(pageSource).toContain('if (!store.dirty) {');
    expect(pageSource).toContain("toast.success('已保存默认地图基本信息')");
    // The store is read through `getState()` so the flag is never stale.
    expect(pageSource).toContain('useEditorStore.getState()');
  });
});
