import { describe, expect, it } from 'vitest';
import { THEME_CHECK_FAIL_COLOR, THEME_CHECK_PASS_COLOR } from '@loredoku/shared';
import { checkColorFor, resolveCheckColors } from './checkStyle';

/**
 * v0.9.3 §3；v0.9.5 起**只剩两档颜色**（那一圈图并进了主题的 `ring`）。
 *
 * 这里钉两件事，都是「配错了会静默失效」的那一类：
 *
 * 1. 主题没配过 → 内置绿 / 红（默认值不能漏，否则圈会画成透明）；
 * 2. 颜色写坏了（空串、`#GGG`、老数据里的空对象）→ 也落回默认，而不是把非法值
 *    塞进 CSS —— 浏览器丢掉一条非法声明时不会报错，圈就那样「没了」。
 *
 * 圈图的解析搬到 `lib/ring.ts` 去了（它和长按那一圈共用一张图）。
 */
describe('resolveCheckColors', () => {
  it('没配过：内置绿 / 红', () => {
    const style = resolveCheckColors(null);
    expect(style.passColor).toBe(THEME_CHECK_PASS_COLOR);
    expect(style.failColor).toBe(THEME_CHECK_FAIL_COLOR);

    expect(resolveCheckColors(undefined)).toEqual(style);
  });

  it('配了就用配的', () => {
    const style = resolveCheckColors({ passColor: '#123456', failColor: '#654321' });
    expect(style.passColor).toBe('#123456');
    expect(style.failColor).toBe('#654321');
  });

  it('颜色写坏了落回默认 —— 非法值会让整条 CSS 声明被丢掉', () => {
    const style = resolveCheckColors({ passColor: '', failColor: '#GGGGGG' });
    expect(style.passColor).toBe(THEME_CHECK_PASS_COLOR);
    expect(style.failColor).toBe(THEME_CHECK_FAIL_COLOR);
  });

  it('按结果取色：通过用第一档，未通过用第二档', () => {
    const style = resolveCheckColors({ passColor: '#111111', failColor: '#222222' });
    expect(checkColorFor(style, true)).toBe('#111111');
    expect(checkColorFor(style, false)).toBe('#222222');
  });
});
