import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DIFFICULTY_TIERS, type ThemeDifficultyTier } from '@loredoku/shared';
import { DifficultyFilter } from './DifficultyFilter';

/** 列表页多一排难度过滤 —— 「全部」打头，后面是这个主题自己的分级叫法。 钉的是「点下去报出哪一档」这条约定：`null` 表示全部（不是 0），因为难度 `level` 从 1 起，0 在这套数据里不是一个合法档位。 */
describe('DifficultyFilter（v0.11.6）', () => {
  let container: HTMLDivElement;
  let root: Root;

  function render(tiers: readonly ThemeDifficultyTier[], value: number | null, onChange = vi.fn()): void {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<DifficultyFilter tiers={tiers} value={value} onChange={onChange} />);
    });
  }

  const chips = (): HTMLButtonElement[] =>
    Array.from(container.querySelectorAll('button'));

  beforeEach(() => {
    container = document.createElement('div');
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('「全部」在最前，后面是这个主题的分级', () => {
    render(DEFAULT_DIFFICULTY_TIERS.slice(0, 3), null);

    expect(chips().map((chip) => chip.textContent)).toEqual([
      '全部',
      ...DEFAULT_DIFFICULTY_TIERS.slice(0, 3).map((tier) => tier.label),
    ]);
  });

  it('当前档位带 aria-pressed，其余不带', () => {
    render(DEFAULT_DIFFICULTY_TIERS.slice(0, 3), 2);

    expect(chips().map((chip) => chip.getAttribute('aria-pressed'))).toEqual([
      'false',
      'false',
      'true',
      'false',
    ]);
  });

  it('点「全部」报 null，点某一档报它的 level', () => {
    const onChange = vi.fn();
    render(DEFAULT_DIFFICULTY_TIERS.slice(0, 3), 2, onChange);

    act(() => chips()[0]?.click());
    expect(onChange).toHaveBeenLastCalledWith(null);

    act(() => chips()[3]?.click());
    expect(onChange).toHaveBeenLastCalledWith(DEFAULT_DIFFICULTY_TIERS[2]?.level);
  });

  it('主题没配分级时整条不画 —— 只剩一枚「全部」的过滤条是噪音', () => {
    render([], null);

    expect(container.querySelector('[data-testid="games-difficulty-filter"]')).toBeNull();
  });
});
