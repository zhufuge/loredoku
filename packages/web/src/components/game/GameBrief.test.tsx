import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GameBrief } from './GameBrief';

/**
 * v0.10.1：竖屏把描述挪进弹框之后，`GameBrief` 要能「只画线索」。
 *
 * 这里断言的是**画了什么**（描述那段文字在不在、线索在不在），不是类名或尺寸。
 */
describe('GameBrief（v0.10.1）', () => {
  let container: HTMLDivElement;
  let root: Root;

  const render = (description: string, clues: string[], hideDescription = false): void => {
    act(() => {
      root.render(
        <GameBrief description={description} clues={clues} hideDescription={hideDescription} />,
      );
    });
  };

  const text = (): string => container.textContent ?? '';

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('默认画描述与线索', () => {
    render('三人三行，各归其位。', ['同一行里没有重复编号']);
    expect(text()).toContain('三人三行，各归其位。');
    expect(text()).toContain('同一行里没有重复编号');
  });

  it('只要线索时：描述不在，线索照旧', () => {
    render('三人三行，各归其位。', ['同一行里没有重复编号', '阴影里没有编号'], true);
    expect(text()).not.toContain('三人三行，各归其位。');
    expect(text()).toContain('同一行里没有重复编号');
    expect(text()).toContain('阴影里没有编号');
  });

  it('没有描述又没有线索时整块不出现', () => {
    render('', [], true);
    expect(container.querySelector('[data-testid="game-brief"]')).toBeNull();
  });

  it('只有描述没有线索、且要求藏描述时整块也不出现', () => {
    render('三人三行，各归其位。', [], true);
    expect(container.querySelector('[data-testid="game-brief"]')).toBeNull();
  });
});
