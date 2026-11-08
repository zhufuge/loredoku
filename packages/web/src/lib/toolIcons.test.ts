import { describe, expect, it } from 'vitest';
import type { GameToolIcons } from '@loredoku/shared';
import { resolveToolIcon, resolveToolIcons } from './toolIcons';

/**
 * v0.8.7 §7 —— 三枚工具按钮图标的解析顺序：**谜题自己的 → 主题的 → 内置图标**。
 *
 * 只钉「选哪一张」与「算作谁配的」：地址怎么拼是 `fileUrlFromPath` 的事，颜色 / 尺寸
 * 是观感（v0.8.4 §2 不写外观断言）。
 */
const own: GameToolIcons = { clear: { path: 'puzzles/1/tool-icons/clear/a.webp' } };
const inherited: GameToolIcons = {
  clear: { path: 'themes/2/tool-icons/clear/b.webp' },
  submit: { path: 'themes/2/tool-icons/submit/c.webp' },
};

describe('resolveToolIcon (v0.8.7 §7)', () => {
  it('自己配了就用自己那张，并且标明来源是谜题', () => {
    const render = resolveToolIcon('clear', own, inherited);
    expect(render?.source).toBe('puzzle');
    expect(render?.imageUrl).toContain('/api/files/puzzles/1/tool-icons/clear/a.webp');
  });

  it('自己没配就跟随主题 —— 只在这一枚上跟随，不影响别的枚', () => {
    const render = resolveToolIcon('submit', own, inherited);
    expect(render?.source).toBe('theme');
    expect(render?.imageUrl).toContain('themes/2/tool-icons/submit/c.webp');
  });

  it('两边都没有是 null（调用方画内置图标）', () => {
    expect(resolveToolIcon('undo', own, inherited)).toBeNull();
    expect(resolveToolIcon('undo', null, null)).toBeNull();
  });

  it('空路径按「没配」处理，不会退化成破图', () => {
    expect(resolveToolIcon('clear', { clear: { path: '' } }, null)).toBeNull();
    expect(resolveToolIcon('clear', { clear: { path: '' } }, inherited)?.source).toBe('theme');
  });
});

describe('resolveToolIcons (v0.8.7 §7)', () => {
  it('只收已配置的枚，缺席的枚不在结果里', () => {
    expect(Object.keys(resolveToolIcons(own, inherited))).toEqual(['clear', 'submit']);
    expect(Object.keys(resolveToolIcons(null, null))).toEqual([]);
  });
});
