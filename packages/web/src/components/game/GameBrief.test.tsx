import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GameBrief } from './GameBrief';

/**
 * v0.7.14（docs/v0.7.14.md §4）：游戏页左栏的「题面」（描述 + 全局线索）。
 *
 * jsdom 不排版，所以这里钉的是**可观察的行为**：没有内容就整块不出现、描述在
 * 线索之前、旧数据里混进的空行不会被渲染成一张空白纸条、线索不带序号（纸条本身
 * 就是一条一条的），以及**只有真的放不下才出现「展开全文」**。
 *
 * 高度靠给 `<p>` 覆盖一对 `scrollHeight / clientHeight` 造出来 —— 与
 * `ClampedText.test.tsx` 同一个手法（jsdom 里所有尺寸恒为 0）。
 *
 * **位置**（标题下面、名册上面、中间没有横线）是页面级的排布，钉在
 * `GamePage.test.tsx` 里 —— 组件自己不知道它左右上下是谁。
 */

describe('GameBrief（v0.7.14）', () => {
  let container: HTMLDivElement;
  let root: Root;

  function render(props: { description: string; clues: string[] }): void {
    act(() => {
      root.render(<GameBrief description={props.description} clues={props.clues} />);
    });
  }

  const brief = (): HTMLElement | null =>
    container.querySelector<HTMLElement>('[data-testid="game-brief"]');
  const description = (): HTMLParagraphElement | null =>
    container.querySelector<HTMLParagraphElement>('[data-testid="game-brief-description"]');
  const toggle = (): HTMLButtonElement | null =>
    container.querySelector<HTMLButtonElement>('[data-testid="game-brief-description-toggle"]');
  const clueLines = (): string[] =>
    Array.from(container.querySelectorAll('[data-testid="game-brief-clue"]')).map(
      (node) => node.textContent?.trim() ?? '',
    );

  /** 造一次「放不下」：三行高 63，内容 105。 */
  function makeOverflow(): void {
    const node = description();
    if (!node) throw new Error('描述没渲染出来');
    Object.defineProperty(node, 'clientHeight', { configurable: true, value: 63 });
    Object.defineProperty(node, 'scrollHeight', { configurable: true, value: 105 });
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
  }

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('renders nothing at all when the puzzle has neither a description nor clues', () => {
    render({ description: '', clues: [] });
    // 一块空白的题面会在标题和名册之间留一段没有内容的空隙 —— 没有内容就没有它。
    expect(brief()).toBeNull();
  });

  it('treats a whitespace-only description as empty', () => {
    render({ description: '   \n  ', clues: [] });
    expect(brief()).toBeNull();
  });

  it('shows the description above the clues, one paper note each and no numbering', () => {
    render({ description: '三人三行，各归其位。', clues: ['同一行里没有重复编号', '阴影里没有编号'] });

    const section = brief();
    expect(section?.textContent).toContain('三人三行，各归其位。');
    // 纸条里就是线索本身：没有「1.」前缀，也没有单独的数字元素。
    expect(clueLines()).toEqual(['同一行里没有重复编号', '阴影里没有编号']);

    // 描述排在线索**之前**：先知道这是哪一局，再读条件。
    const paragraph = description();
    const list = section?.querySelector('ol');
    expect(paragraph && list).not.toBeNull();
    expect(
      (paragraph as Element).compareDocumentPosition(list as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('keeps the clues alone when the puzzle has no description', () => {
    render({ description: '', clues: ['阴影里没有编号'] });
    expect(description()).toBeNull();
    expect(clueLines()).toEqual(['阴影里没有编号']);
  });

  it('skips blank and padded lines left over from older payloads', () => {
    render({ description: '', clues: ['  阴影里没有编号  ', '', '   ', '同一行里没有重复编号'] });
    expect(clueLines()).toEqual(['阴影里没有编号', '同一行里没有重复编号']);
  });

  /**
   * 折叠只对「真的放不下」的描述生效：
   * 收起态三行 + 「展开全文」，点一下整段展开、按钮变成「收起」，再点回去。
   */
  it('folds a description that does not fit, and unfolds it on click', () => {
    render({ description: '凤姐午睡醒来，枕下的那串钥匙不见了。', clues: [] });

    // 放得下的时候什么都不挂：一个点了没反应的「展开全文」比没有更糟。
    expect(toggle()).toBeNull();
    expect(description()?.dataset.collapsed).toBeUndefined();

    makeOverflow();
    expect(description()?.dataset.collapsed).toBe('true');
    expect(toggle()?.textContent).toContain('展开全文');
    expect(toggle()?.getAttribute('aria-expanded')).toBe('false');

    act(() => toggle()?.click());
    expect(description()?.dataset.collapsed).toBeUndefined();
    expect(toggle()?.textContent).toContain('收起');
    expect(toggle()?.getAttribute('aria-expanded')).toBe('true');

    // 展开之后按钮**还在** —— 它不能跟着「量出来没溢出」一起消失，否则收不回去。
    act(() => toggle()?.click());
    expect(description()?.dataset.collapsed).toBe('true');
    expect(toggle()?.textContent).toContain('展开全文');
  });
});
