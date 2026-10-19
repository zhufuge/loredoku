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

export function useEditorShortcuts(shortcuts: EditorShortcuts): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === 's') {
        event.preventDefault();
        shortcuts.save();
        return;
      }
      if (event.code === 'Space') {
        event.preventDefault();
        shortcuts.onSpaceHeldChange(true);
        return;
      }
      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) shortcuts.redo();
        else shortcuts.undo();
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
