import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorShortcuts, type EditorShortcuts } from './useEditorShortcuts';

/**
 * v0.7.9 §2：快捷键的**边界**，不是快捷键本身。
 *
 * Ctrl+S / Ctrl+Z / Ctrl+Shift+Z 在 v0.7.0 就有了；这一轮修的是三个会咬人的场景：
 * 焦点在下拉里按字母、弹窗打开时按 Ctrl+Z、以及 Space 抢掉按钮的激活键。
 * 这三条都只有在「谁拿到了这次按键」这一层才看得见，所以逐个钉住。
 */
describe('useEditorShortcuts (v0.7.9 §2)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.innerHTML = '';
  });

  function mount(overrides: Partial<EditorShortcuts> = {}): EditorShortcuts {
    const handlers: EditorShortcuts = {
      save: vi.fn(),
      undo: vi.fn(),
      redo: vi.fn(),
      centerView: vi.fn(),
      moveSelection: vi.fn(),
      onSpaceHeldChange: vi.fn(),
      onEscape: vi.fn(),
      onKey: vi.fn(() => false),
      ...overrides,
    };
    function Harness(): JSX.Element {
      useEditorShortcuts(handlers);
      return <div />;
    }
    act(() => root.render(<Harness />));
    return handlers;
  }

  function press(init: KeyboardEventInit, target?: EventTarget): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
    act(() => {
      (target ?? window).dispatchEvent(event);
    });
    return event;
  }

  it('Ctrl+S 保存并吃掉浏览器默认动作', () => {
    const handlers = mount();
    const event = press({ key: 's', ctrlKey: true });
    expect(handlers.save).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('Ctrl+Z 撤销，Ctrl+Shift+Z 与 Ctrl+Y 都是重做', () => {
    const handlers = mount();
    press({ key: 'z', ctrlKey: true });
    press({ key: 'z', ctrlKey: true, shiftKey: true });
    press({ key: 'y', ctrlKey: true });
    expect(handlers.undo).toHaveBeenCalledTimes(1);
    expect(handlers.redo).toHaveBeenCalledTimes(2);
  });

  it('焦点在输入框里时，快捷键完全让位给输入框自己的撤销', () => {
    const handlers = mount();
    const input = document.createElement('input');
    document.body.appendChild(input);
    press({ key: 'z', ctrlKey: true }, input);
    press({ key: 's', ctrlKey: true }, input);
    expect(handlers.undo).not.toHaveBeenCalled();
    expect(handlers.save).not.toHaveBeenCalled();
  });

  it('焦点在下拉里时，V / R / E 不会被当成工具切换', () => {
    const handlers = mount();
    const select = document.createElement('select');
    const option = document.createElement('option');
    select.appendChild(option);
    document.body.appendChild(select);
    press({ key: 'v' }, select);
    expect(handlers.onKey).not.toHaveBeenCalled();
  });

  it('弹窗打开时，Ctrl+Z 不穿透到背后的画布', () => {
    const handlers = mount();
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('data-state', 'open');
    document.body.appendChild(dialog);
    press({ key: 'z', ctrlKey: true });
    expect(handlers.undo).not.toHaveBeenCalled();
  });

  it('焦点在按钮上时，Space 留给按钮自己激活', () => {
    const handlers = mount();
    const button = document.createElement('button');
    document.body.appendChild(button);
    const event = press({ code: 'Space', key: ' ' }, button);
    expect(handlers.onSpaceHeldChange).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('焦点在画布上时，Space 仍然是平移预备', () => {
    const handlers = mount();
    const event = press({ code: 'Space', key: ' ' });
    expect(handlers.onSpaceHeldChange).toHaveBeenCalledWith(true);
    expect(event.defaultPrevented).toBe(true);
  });
});
