import { useEffect, useState } from 'react';

/**
 * 两个编辑器共用的保存流程（FIX-F01, docs/v0.3.10.md §1）：**一条**代码路径落**整份**草稿，工具栏的保存与基本信息抽屉的保存因此不可能对「已保存」有分歧；在途守卫、错误交给 mutation toast、遮罩延迟淡出，两边完全一致。
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
  /** Mask visibility with the delayed fade: stays mounted for 150ms after the request lands so the opacity transition can finish. The puzzle editor used to unmount it instantly; both pages now share the map editor's version. */
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
