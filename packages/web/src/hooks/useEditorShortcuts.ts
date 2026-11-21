import { useEffect } from 'react';

/**
 * 两个编辑器共用的键盘流：Ctrl/Cmd+S 保存、Space 平移预备、Ctrl/Cmd+Z 撤销（+Shift 重做）、Ctrl/Cmd+0 居中、方向键选中格；差异项留页面；effect 故意不写依赖数组（闭包读实时 store）。
 */
export interface EditorShortcuts {
  save: () => void;
  undo: () => void;
  redo: () => void;
  centerView: () => void;
  /** Arrow keys: move the cell selection by one step (page checks bounds). */
  moveSelection: (dx: number, dy: number) => void;
  onSpaceHeldChange: (held: boolean) => void;
  onEscape: () => void;
  /** Page-owned keys; return `true` when the event was handled. */
  onKey?: (event: KeyboardEvent) => boolean;
}

const ARROW_STEPS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

/** 焦点在原生下拉 / 输入里时，字母键不该落到画布上（否则按 V/R/E 会莫名切工具）。 */
function isTextEntry(target: EventTarget | null): boolean {
  const node = target as HTMLElement | null;
  if (!node) return false;
  return (
    node.tagName === 'INPUT' ||
    node.tagName === 'TEXTAREA' ||
    node.tagName === 'SELECT' ||
    node.isContentEditable
  );
}

/** 有模态框时快捷键整体让位：Radix Dialog 打开时写 `data-state="open"`，不用拿引用。 */
function hasOpenModal(): boolean {
  if (typeof document === 'undefined') return false;
  return (
    document.querySelector('[role="dialog"][data-state="open"]') !== null ||
    document.querySelector('[role="alertdialog"][data-state="open"]') !== null
  );
}

/** 焦点在可激活元素上时，Space 是「按下这个按钮」，不是「平移预备」。 */
function isActivatable(target: EventTarget | null): boolean {
  const node = target as HTMLElement | null;
  if (!node || typeof node.closest !== 'function') return false;
  return (
    node.closest(
      'button, a[href], [role="button"], [role="option"], [role="tab"], [role="checkbox"], [role="switch"], [role="menuitem"]',
    ) !== null
  );
}

export function useEditorShortcuts(shortcuts: EditorShortcuts): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isTextEntry(event.target)) return;
      // 模态框打开时键盘归它；撤销 / 保存 / 方向键都不该穿透到画布。
      if (hasOpenModal()) return;
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (mod && key === 's') {
        event.preventDefault();
        shortcuts.save();
        return;
      }
      if (event.code === 'Space') {
        // 只吞下「没有落在按钮上」的 Space —— 焦点停在工具条任一按钮上时，
        // Space 是「按下这个按钮」；一律 preventDefault 等于把整条工具条锁死，
        // 对只能用键盘的人尤其致命。
        if (isActivatable(event.target)) return;
        event.preventDefault();
        shortcuts.onSpaceHeldChange(true);
        return;
      }
      if (mod && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) shortcuts.redo();
        else shortcuts.undo();
        return;
      }
      // Windows 习惯：Ctrl+Y 也是重做。
      if (mod && key === 'y') {
        event.preventDefault();
        shortcuts.redo();
        return;
      }
      if (mod && event.key === '0') {
        event.preventDefault();
        shortcuts.centerView();
        return;
      }
      if (event.key === 'Escape') {
        shortcuts.onEscape();
        return;
      }
      if (mod) return;
      if (shortcuts.onKey?.(event)) return;
      const step = ARROW_STEPS[event.key];
      if (step) shortcuts.moveSelection(step[0], step[1]);
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.code === 'Space') shortcuts.onSpaceHeldChange(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  });
}
