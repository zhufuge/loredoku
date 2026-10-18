import { useEffect, useState } from 'react';

/**
 * the save flow both editors share (FIX-F01's single writer, plus the
 * 保存中 mask), lifted out of `EditorPage` / `PuzzleEditorPage`.
 *
 * FIX-F01 (docs/v0.3.10.md §1): one code path persists the **whole** draft, so
 * the toolbar's 保存 and the 基本信息 drawer's 保存 can never disagree about
 * what "saved" means. Each page supplies its own mutation, payload builder and
 * post-save bookkeeping; everything else — the in-flight guard, the toast-free
 * error handling, the delayed mask fade — is identical on both sides.
 */
export interface EditorSaveSpec<TData, TPayload> {
  id: number;
  mutation: {
    isPending: boolean;
    mutateAsync: (vars: { id: number; payload: TPayload }) => Promise<TData>;
  };
  /** Built at call time, so the store's current draft is what gets written. */
  buildPayload: () => TPayload;
  /** Store-side bookkeeping after a successful write (markSaved, version info). */
  onSaved: (data: TData) => void;
}

export interface EditorSaveFlow {
  /** The single writer. `false` = the request failed (errors toast via mutation). */
  persist: () => Promise<boolean>;
  /** Fire-and-forget 保存 (toolbar button, Ctrl+S). */
  save: () => void;
  saving: boolean;
  /**
   * Mask visibility with the delayed fade: stays mounted for 150ms after the
   * request lands so the opacity transition can finish. The puzzle editor used
   * to unmount it instantly; both pages now share the map editor's version.
   */
  saveMaskVisible: boolean;
}

const MASK_FADE_MS = 150;

export function useEditorSave<TData, TPayload>(spec: EditorSaveSpec<TData, TPayload>): EditorSaveFlow {
  const { id, mutation, buildPayload, onSaved } = spec;
  const saving = mutation.isPending;
  const [maskVisible, setMaskVisible] = useState(false);

  useEffect(() => {
    if (saving) {
      setMaskVisible(true);
      return;
    }
    const timer = setTimeout(() => setMaskVisible(false), MASK_FADE_MS);
    return () => clearTimeout(timer);
  }, [saving]);

  const persist = async (): Promise<boolean> => {
    if (mutation.isPending) return false;
    try {
      const data = await mutation.mutateAsync({ id, payload: buildPayload() });
      onSaved(data);
      return true;
    } catch {
      /* errors surfaced via mutation toasts */
      return false;
    }
  };

  const save = (): void => {
    void persist();
  };

  return { persist, save, saving, saveMaskVisible: maskVisible };
}
