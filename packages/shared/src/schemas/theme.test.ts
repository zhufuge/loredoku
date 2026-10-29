import { describe, expect, it } from 'vitest';
import { createThemeSchema, themeCodeSchema } from './theme';

/**
 * v0.8.0 §18：主题编码是工作空间的地址前缀（`/hlm/maps`），所以除了字符集，还要拦
 * **顶层静态路径** —— 一个叫 `settings` 的主题永远打不开自己的工作台。
 */

function codeError(input: string): string | null {
  const parsed = themeCodeSchema.safeParse(input);
  return parsed.success ? null : (parsed.error.issues[0]?.message ?? '');
}

describe('themeCodeSchema（v0.8.0 §18）', () => {
  it('普通编码照常通过', () => {
    expect(codeError('hlm')).toBeNull();
    expect(codeError('hlm-2')).toBeNull();
    expect(codeError('hong_lou_meng')).toBeNull();
  });

  it('顶层静态路径被拦下，并说出被占用的那个词', () => {
    for (const reserved of ['settings', 'play', 'maps', 'assets', 'themes']) {
      const message = codeError(reserved);
      expect(message, reserved).not.toBeNull();
      expect(message).toContain(reserved);
      expect(message).toContain('换一个编码');
    }
  });

  it('只拦整个编码，不拦包含保留词的编码', () => {
    // `maps-old` 不是 `/maps`，两者不冲突。
    expect(codeError('maps-old')).toBeNull();
  });

  it('字符集与长度照旧', () => {
    expect(codeError('Hlm')).not.toBeNull();
    expect(codeError('-hlm')).not.toBeNull();
    expect(codeError('')).not.toBeNull();
  });

  it('创建时同样走这套校验（不是只有单独调用才拦）', () => {
    const parsed = createThemeSchema.safeParse({ code: 'settings', name: '设置' });
    expect(parsed.success).toBe(false);
  });
});
