import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchInput } from './SearchInput';

/**
 * v0.10.2：所有搜索框加 × 清空。
 *
 * 要钉的是行为，不是长相：空框上不该挂一枚点不动的按钮；有内容时点一下
 * 就把值交回空串、并且把焦点还给输入框（「重新搜」的起点）；输入过程中
 * 组件不能替调用方 trim —— 四处列表页的 300ms 防抖靠原始输入判断变化。
 */

describe('SearchInput', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function input(): HTMLInputElement {
    const node = container.querySelector<HTMLInputElement>('input');
    if (!node) throw new Error('搜索框没渲染出来');
    return node;
  }

  function clearButton(): HTMLButtonElement | null {
    return container.querySelector<HTMLButtonElement>('button');
  }

  /** 受控组件：把值留在 state 里，才能看到按钮随内容出现与消失。 */
  function Harness({ onChange }: { onChange?: (next: string) => void }): JSX.Element {
    const [value, setValue] = useState('');
    return (
      <SearchInput
        value={value}
        onValueChange={(next) => {
          onChange?.(next);
          setValue(next);
        }}
        placeholder="搜索名称"
      />
    );
  }

  function type(text: string): void {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    act(() => {
      setter?.call(input(), text);
      input().dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  it('空框上不挂清空按钮', () => {
    act(() => root.render(<Harness />));
    expect(clearButton()).toBeNull();
  });

  it('有内容时点一下，值交回空串', () => {
    const onChange = vi.fn();
    act(() => root.render(<Harness onChange={onChange} />));
    type('麒麟');

    const button = clearButton();
    expect(button).not.toBeNull();
    expect(input().value).toBe('麒麟');

    act(() => button?.click());
    expect(onChange).toHaveBeenLastCalledWith('');
    expect(input().value).toBe('');
    expect(clearButton()).toBeNull();
  });

  it('清空之后焦点回到输入框', () => {
    act(() => root.render(<Harness />));
    type('麒麟');
    act(() => clearButton()?.click());
    expect(document.activeElement).toBe(input());
  });

  it('输入原样回传，不替调用方裁剪', () => {
    const onChange = vi.fn();
    act(() => root.render(<Harness onChange={onChange} />));
    type('  麒麟  ');
    expect(onChange).toHaveBeenCalledWith('  麒麟  ');
  });

  it('清空按钮带一个能读出来的名字', () => {
    act(() => root.render(<Harness />));
    type('麒麟');
    expect(clearButton()?.getAttribute('aria-label')).toBe('清空搜索');
  });
});
