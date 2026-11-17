import { describe, expect, it } from 'vitest';
import {
  THEME_VERDICT_ICON_FALLBACK,
  THEME_VERDICT_TITLE_FALLBACK,
} from './constants/game';
import { resolveVerdictStyle } from './verdict';

/**
 * v0.11.3：结算卡那两行「读取时兜底」。
 *
 * 为什么不是「新建主题时抄一份默认值进库」：默认值将来还会变（比如换一个 emoji），
 * 抄进库里的那些主题就永远停在旧那一版了。这里只在**画的时候**填，库里存的是
 * 作者显式填过的那份 —— 没填就是 `undefined`。
 */
describe('resolveVerdictStyle（v0.11.3）', () => {
  it('没配主题：内置的 🎉 +「解题成功」', () => {
    expect(resolveVerdictStyle(null)).toEqual({
      iconText: THEME_VERDICT_ICON_FALLBACK,
      iconPath: null,
      title: THEME_VERDICT_TITLE_FALLBACK,
    });
    expect(resolveVerdictStyle(undefined)).toEqual({
      iconText: THEME_VERDICT_ICON_FALLBACK,
      iconPath: null,
      title: THEME_VERDICT_TITLE_FALLBACK,
    });
  });

  it('配了就照用', () => {
    expect(resolveVerdictStyle({ iconText: '🏮', title: '此案已了' })).toEqual({
      iconText: '🏮',
      iconPath: null,
      title: '此案已了',
    });
  });

  it('空串 / 全空白也退回默认 —— 那是「清空输入框」的表达', () => {
    expect(resolveVerdictStyle({ iconText: '', title: '   ' })).toEqual({
      iconText: THEME_VERDICT_ICON_FALLBACK,
      iconPath: null,
      title: THEME_VERDICT_TITLE_FALLBACK,
    });
  });

  it('上传了图标图就给出路径（画图由调用方决定）', () => {
    expect(resolveVerdictStyle({ icon: { path: 'themes/2/verdict/a.webp' } }).iconPath).toBe(
      'themes/2/verdict/a.webp',
    );
  });

  it('路径是空串时当作没有 —— 别拿它去拼一个空地址', () => {
    expect(resolveVerdictStyle({ icon: { path: '' } }).iconPath).toBeNull();
  });

  it('有图标图时文字照旧返回 —— 由界面决定用哪个', () => {
    const style = resolveVerdictStyle({ iconText: '🏮', icon: { path: 'themes/2/verdict/a.webp' } });
    expect(style.iconText).toBe('🏮');
    expect(style.iconPath).toBe('themes/2/verdict/a.webp');
  });
});
