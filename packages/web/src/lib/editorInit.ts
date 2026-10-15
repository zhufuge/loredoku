import type { ProjectStatus } from '@murdoku/shared';

/**
 * FIX-E01 (docs/v0.3.9.md §1).
 *
 * `EditorPage` re-reads `/map` whenever the query is invalidated. Publishing
 * bumps `currentVersionNo` / `status` on the project row (and invalidates the
 * query) **without touching the draft**, and the old code treated that as "the
 * map changed", re-running `editor.init()` — which resets zoom / pan and made
 * the canvas jump right after a successful publish.
 *
 * The decision is a pure function so the rule is covered by tests instead of
 * being buried in an effect.
 */
export type EditorInitAction =
  /** Load the draft into the editor (resets the viewport). */
  | 'init'
  /** Same draft — only refresh the version badge, keep the viewport. */
  | 'sync-version'
  /** Nothing to do. */
  | 'none';

export interface EditorInitInput {
  /** `initKeyRef.current` — the project the editor was last initialised with. */
  loadedProjectId: number | null;
  projectId: number;
  /** `editor.updatedAt` — the draft revision currently in the store. */
  storedUpdatedAt: string | null;
  /** `mapQuery.data.updatedAt` — the revision the server just returned. */
  fetchedUpdatedAt: string | null;
  storedVersionNo: number | null;
  fetchedVersionNo: number | null;
  storedStatus: ProjectStatus;
  fetchedStatus: ProjectStatus;
}

export function resolveEditorInit(input: EditorInitInput): EditorInitAction {
  const {
    loadedProjectId,
    projectId,
    storedUpdatedAt,
    fetchedUpdatedAt,
    storedVersionNo,
    fetchedVersionNo,
    storedStatus,
    fetchedStatus,
  } = input;

  // A different map, or a draft revision we have not seen → full re-init.
  if (loadedProjectId !== projectId) return 'init';
  if ((storedUpdatedAt ?? null) !== (fetchedUpdatedAt ?? null)) return 'init';

  // Same draft: publishing / restoring only moved the version metadata.
  if (storedVersionNo !== fetchedVersionNo || storedStatus !== fetchedStatus) {
    return 'sync-version';
  }
  return 'none';
}
