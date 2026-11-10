import { describe, expect, it } from 'vitest';
import { resolveMarkImage } from './mark';

/**
 * v0.8.6（docs/v0.8.6.md §4）/ v0.8.7（§2）：上传文件路径 → 站内图片地址，
 * 以及「谜题 → 主题」这条来源顺序。
 */
describe('resolveMarkImage', () => {
  it('两边都没有（缺席 / null）时没有图片', () => {
    expect(resolveMarkImage(undefined)).toBeNull();
    expect(resolveMarkImage(null)).toBeNull();
    expect(resolveMarkImage(null, null)).toBeNull();
  });

  it('谜题自己的那张优先于主题', () => {
    expect(
      resolveMarkImage(
        { path: 'puzzles/12/mark/a1.webp' },
        { path: 'themes/3/mark/b2.webp' },
      ),
    ).toEqual({
      imageUrl: '/api/files/puzzles/12/mark/a1.webp',
      source: 'puzzle',
    });
  });

  it('谜题没配就跟随主题 —— 作者不必每建一题都上传一次', () => {
    expect(
      resolveMarkImage(null, { path: 'themes/3/mark/b2.webp' }),
    ).toEqual({
      imageUrl: '/api/files/themes/3/mark/b2.webp',
      source: 'theme',
    });
  });

  it('把上传路径拼成站内地址', () => {
    expect(resolveMarkImage({ path: 'puzzles/12/mark/a1.webp' })).toEqual({
      imageUrl: '/api/files/puzzles/12/mark/a1.webp',
      source: 'puzzle',
    });
  });

  it('空字符串路径按「没配」处理（后端不会写，但坏数据不该画出破图地址）', () => {
    expect(resolveMarkImage({ path: '' }, { path: 'themes/3/x.webp' })?.source).toBe(
      'theme',
    );
  });
});
