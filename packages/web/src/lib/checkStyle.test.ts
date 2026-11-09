import { describe, expect, it } from 'vitest';
import { THEME_CHECK_FAIL_COLOR, THEME_CHECK_PASS_COLOR } from '@loredoku/shared';
import { checkColorFor, resolveCheckStyle } from './checkStyle';

/**
 * v0.9.3 §3：校验那一圈的样式解析。
 *
 * 这里钉三件事，都是「配错了会静默失效」的那一类：
 *
 * 1. 主题没配过 → 内置绿 / 红（默认值不能漏，否则圈会画成透明）；
 * 2. 颜色写坏了（空串、`#GGG`、老数据里的空对象）→ 也落回默认，而不是把非法值
 *    塞进 CSS —— 浏览器丢掉一条非法声明时不会报错，圈就那样「没了」；
 * 3. 圈图按主题的 `path` 拼地址，播放器传自己的包根解析器。
 */
describe('resolveCheckStyle', () => {
  it('没配过：内置绿 / 红，没有圈图', () => {
    const style = resolveCheckStyle(null);
    expect(style.passColor).toBe(THEME_CHECK_PASS_COLOR);
    expect(style.failColor).toBe(THEME_CHECK_FAIL_COLOR);
    expect(style.ringUrl).toBeNull();

    expect(resolveCheckStyle(undefined)).toEqual(style);
  });

  it('配了就用配的，圈图拼成接口地址', () => {
    const style = resolveCheckStyle({
      passColor: '#123456',
      failColor: '#654321',
      ring: { path: 'themes/3/check-ring/a.webp' },
    });
    expect(style.passColor).toBe('#123456');
    expect(style.failColor).toBe('#654321');
    expect(style.ringUrl).toBe('/api/files/themes/3/check-ring/a.webp');
  });

  it('颜色写坏了落回默认 —— 非法值会让整条 CSS 声明被丢掉', () => {
    const style = resolveCheckStyle({ passColor: '', failColor: '#GGGGGG' });
    expect(style.passColor).toBe(THEME_CHECK_PASS_COLOR);
    expect(style.failColor).toBe(THEME_CHECK_FAIL_COLOR);
  });

  it('播放器传包根解析器：圈图落在包里', () => {
    const style = resolveCheckStyle(
      { passColor: '#123456', failColor: '#654321', ring: { path: 'files/check/check-ring.webp' } },
      (path) => `/loredoku/hlm/${path}`,
    );
    expect(style.ringUrl).toBe('/loredoku/hlm/files/check/check-ring.webp');
  });

  it('按结果取色：通过用第一档，未通过用第二档', () => {
    const style = resolveCheckStyle({ passColor: '#111111', failColor: '#222222' });
    expect(checkColorFor(style, true)).toBe('#111111');
    expect(checkColorFor(style, false)).toBe('#222222');
  });
});
