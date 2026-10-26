import { useEffect, useState } from 'react';

export type ViewMode = 'grid' | 'list';

/**
 * 网格 / 列表偏好，落在 `localStorage`（刷新后保持，与查看器的标尺开关同一模式）。
 *
 * v0.7.9 §1.1：这个偏好**只服务草稿块**。版本是冻结快照，恒为列表 —— 所以它不再是
 * 「页面级」设置，开关也随之下沉到「草稿」标题右侧（见 `ViewToggle`）。
 * 两个列表页各用各的 key（`loredoku.maps.view` / `loredoku.puzzles.view`），
 * 互不干扰。
 */
export function useStoredView(storageKey: string): [ViewMode, (next: ViewMode) => void] {
  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window === 'undefined') return 'grid';
    return window.localStorage.getItem(storageKey) === 'list' ? 'list' : 'grid';
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKey, view);
    }
  }, [storageKey, view]);

  return [view, setView];
}
