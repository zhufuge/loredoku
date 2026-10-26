import { useEffect } from 'react';

/**
 * the keyboard flow both editors share, lifted out of `MapEditorPage` /
 * `PuzzleEditorPage`.
 *
 * The shared keys are the ones that mean the same thing on both canvases:
 * Ctrl/Cmd+S 保存, Space 平移预备, Ctrl/Cmd+Z 撤销（+Shift 重做）, Ctrl/Cmd+0
 * 居中, and the arrow keys moving the cell selection.
 *
 * Everything that differs stays with the page: `onEscape` owns the whole
 * cascade (the map editor leaves the 基本信息 drawer first and asks when it is
 * dirty; the puzzle editor walks slot-drag → position-pick → focus), and
 * `onKey` owns the map-only tool switches (V / R / E) and Delete / Backspace.
 * The puzzle canvas is read-only (SPEC-K07 §4.4), so it passes no `onKey`.
 *
 * The effect deliberately has **no dependency array** — the same choice the
 * pages made: the handlers close over live store state, and re-registering two
 * window listeners per render is cheaper than a stale closure.
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

/**
 * v0.7.9：**焦点在原生下拉里时，字母键不该落到画布上**。
 *
 * 原来只挡 `INPUT` / `TEXTAREA` / `contentEditable`。`<select>` 不在其中，于是
 * 下拉获得焦点后按 V / R / E（选地区、选形态时很自然会按）会顺带切换编辑工具，
 * 而屏幕上看不出任何原因 —— 工具条离得远，用户只会觉得「按了个键，工具自己变了」。
 */
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

/**
 * 有模态框时，画布快捷键整体让位。Radix 的 `Dialog` / `AlertDialog` 打开时会在
 * 内容节点上写 `data-state="open"`，判定不需要拿到 dialog 的引用。
 *
 * 不做这层判断的后果：在「联动条件」「版本历史」这类弹窗里按 Ctrl+Z，撤销的是
 * **弹窗背后**的画布，弹窗里看到的输入却不变 —— 一次误按改掉了看不见的东西。
 */
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
        // v0.7.9：只吞下「没有落在按钮上」的 Space。原来一律 preventDefault，
        // 于是键盘焦点停在工具条任一按钮上时按 Space 激活不了它 ——
        // 对只能用键盘的人，这等于把整条工具条锁死。
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
