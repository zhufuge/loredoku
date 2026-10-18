import type { ProjectStatus } from '@loredoku/shared';

/**
 * FIX-E01 (docs/v0.3.9.md §1).
 *
 * `EditorPage` re-reads `/map` whenever the query is invalidated. Publishing used
 * to bump `currentVersionNo` / `status` on the project row (and invalidated the
 * query) **without touching the draft**, and the old code treated that as "the
 * map changed", re-running `editor.init()` — which resets zoom / pan and made
 * the canvas jump right after a successful publish.
 *
 * The decision is a pure function so the rule is covered by tests instead of
 * being buried in an effect.
 *
 * 判定只有两条：
 *
 * - 换了一张图（`projectId` 变了）→ 整份重载；
 * - 同一张图、只是版本号 / 状态变了（发布、删版本、恢复）→ 只刷版本徽标，
 *   视口原地不动。
 *
 * 草稿内容本身不参与判定：另一个会话保存了草稿，本页也不会自动重载 —— 与其
 * 在用户画到一半时把画布换掉，不如让最后一次保存胜出。
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
  storedVersionNo: number | null;
  fetchedVersionNo: number | null;
  storedStatus: ProjectStatus;
  fetchedStatus: ProjectStatus;
}

export function resolveEditorInit(input: EditorInitInput): EditorInitAction {
  const {
    loadedProjectId,
    projectId,
    storedVersionNo,
    fetchedVersionNo,
    storedStatus,
    fetchedStatus,
  } = input;

  // A different map → full re-init.
  if (loadedProjectId !== projectId) return 'init';

  // Same map: publishing / restoring only moved the version metadata.
  if (storedVersionNo !== fetchedVersionNo || storedStatus !== fetchedStatus) {
    return 'sync-version';
  }
  return 'none';
}
