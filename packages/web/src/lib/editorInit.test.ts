import { describe, expect, it } from 'vitest';
import { resolveEditorInit, type EditorInitInput } from './editorInit';

/**
 * 判定只有三种结果：「换图 → init」「同图但版本元数据变了 → sync-version」
 * 「什么都没变 → none」。草稿内容不参与判定。
 */
const base: EditorInitInput = {
  loadedMapId: 7,
  mapId: 7,
  storedVersionNo: null,
  fetchedVersionNo: null,
  storedStatus: 'draft',
  fetchedStatus: 'draft',
};

describe('resolveEditorInit (FIX-E01)', () => {
  it('does nothing when the map and the metadata are unchanged', () => {
    expect(resolveEditorInit(base)).toBe('none');
  });

  it('FIX-E01: publishing only syncs the badge — the viewport is kept', () => {
    expect(
      resolveEditorInit({ ...base, fetchedVersionNo: 1, fetchedStatus: 'published' }),
    ).toBe('sync-version');
  });

  it('treats a restored / deleted version the same way', () => {
    expect(resolveEditorInit({ ...base, storedVersionNo: 2, fetchedVersionNo: 1 })).toBe(
      'sync-version',
    );
    expect(
      resolveEditorInit({
        ...base,
        storedVersionNo: 1,
        storedStatus: 'published',
        fetchedVersionNo: null,
        fetchedStatus: 'draft',
      }),
    ).toBe('sync-version');
  });

  it('re-initialises when a different map is loaded', () => {
    expect(resolveEditorInit({ ...base, loadedMapId: 3 })).toBe('init');
    expect(resolveEditorInit({ ...base, loadedMapId: null })).toBe('init');
  });

  it('改名 / 换封面不会再重建画布（判定里已无修订号）', () => {
    // 输入形状就是契约：没有 updatedAt，也就没有「草稿修订号变了」这条分支。
    expect(Object.keys(base).sort()).toEqual([
      'fetchedStatus',
      'fetchedVersionNo',
      'loadedMapId',
      'mapId',
      'storedStatus',
      'storedVersionNo',
    ]);
  });
});
