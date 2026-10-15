import { describe, expect, it } from 'vitest';
import { resolveEditorInit, type EditorInitInput } from './editorInit';

const base: EditorInitInput = {
  loadedProjectId: 7,
  projectId: 7,
  storedUpdatedAt: '2026-10-15T10:00:00.000Z',
  fetchedUpdatedAt: '2026-10-15T10:00:00.000Z',
  storedVersionNo: null,
  fetchedVersionNo: null,
  storedStatus: 'draft',
  fetchedStatus: 'draft',
};

describe('resolveEditorInit (FIX-E01)', () => {
  it('does nothing when the draft and the metadata are unchanged', () => {
    expect(resolveEditorInit(base)).toBe('none');
  });

  it('FIX-E01: publishing only syncs the badge — the viewport is kept', () => {
    expect(
      resolveEditorInit({ ...base, fetchedVersionNo: 1, fetchedStatus: 'published' }),
    ).toBe('sync-version');
  });

  it('treats a restored / deleted version the same way', () => {
    expect(
      resolveEditorInit({ ...base, storedVersionNo: 2, fetchedVersionNo: 1 }),
    ).toBe('sync-version');
    expect(
      resolveEditorInit({ ...base, storedVersionNo: 1, storedStatus: 'published', fetchedVersionNo: null, fetchedStatus: 'draft' }),
    ).toBe('sync-version');
  });

  it('re-initialises when the draft revision actually changed', () => {
    expect(
      resolveEditorInit({ ...base, fetchedUpdatedAt: '2026-10-15T11:00:00.000Z' }),
    ).toBe('init');
  });

  it('re-initialises when a different map is loaded', () => {
    expect(resolveEditorInit({ ...base, loadedProjectId: 3 })).toBe('init');
    expect(resolveEditorInit({ ...base, loadedProjectId: null })).toBe('init');
  });

  it('handles a never-saved draft (both `updatedAt` null)', () => {
    expect(
      resolveEditorInit({ ...base, storedUpdatedAt: null, fetchedUpdatedAt: null }),
    ).toBe('none');
    // The editor was initialised from a draft that has since been saved.
    expect(
      resolveEditorInit({ ...base, storedUpdatedAt: null, fetchedUpdatedAt: '2026-10-15T12:00:00.000Z' }),
    ).toBe('init');
  });

  it('prefers a full re-init when both the draft and the version moved', () => {
    expect(
      resolveEditorInit({
        ...base,
        fetchedUpdatedAt: '2026-10-15T13:00:00.000Z',
        fetchedVersionNo: 4,
        fetchedStatus: 'published',
      }),
    ).toBe('init');
  });
});
