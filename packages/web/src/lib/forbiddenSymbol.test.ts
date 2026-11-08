import { describe, expect, it } from 'vitest';
import { resolveForbiddenSymbolImage } from './forbiddenSymbol';

/**
 * v0.8.6（docs/v0.8.6.md §4）：上传文件路径 → 站内图片地址。
 *
 * 只钉两件事：没配置时没有图（调用方退回 ×）、配置了就把 `/api/files/` 拼上。
 */
describe('resolveForbiddenSymbolImage', () => {
  it('没有配置（缺席 / null）时没有图片', () => {
    expect(resolveForbiddenSymbolImage(undefined)).toBeNull();
    expect(resolveForbiddenSymbolImage(null)).toBeNull();
  });

  it('把上传路径拼成站内地址', () => {
    expect(resolveForbiddenSymbolImage({ path: 'puzzles/12/forbidden-symbol/a1.webp' })).toEqual({
      imageUrl: '/api/files/puzzles/12/forbidden-symbol/a1.webp',
    });
  });

  it('主题的文件路径同样适用（新建谜题会抄主题缺省）', () => {
    expect(resolveForbiddenSymbolImage({ path: 'themes/3/forbidden-symbol/b2.webp' })).toEqual({
      imageUrl: '/api/files/themes/3/forbidden-symbol/b2.webp',
    });
  });
});
