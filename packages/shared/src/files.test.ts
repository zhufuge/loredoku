import { describe, expect, it } from 'vitest';
import { fileUrlFromPath } from './files';

/**
 * v0.8.6（docs/v0.8.6.md §4）：数据里存的是 `storage/uploads` 下的相对路径，
 * 页面同源取图 —— 拼出来的地址只有「/api/files/」这一个前缀，不含 host。
 */
describe('fileUrlFromPath', () => {
  it('相对路径直接拼到文件路由下', () => {
    expect(fileUrlFromPath('puzzles/12/forbidden-symbol/a1b2.webp')).toBe(
      '/api/files/puzzles/12/forbidden-symbol/a1b2.webp',
    );
  });

  it('开头的斜杠与反斜杠会被归一化掉（不让路径拼出双斜杠）', () => {
    expect(fileUrlFromPath('/puzzles/12/x.webp')).toBe('/api/files/puzzles/12/x.webp');
    expect(fileUrlFromPath('puzzles\\12\\x.webp')).toBe('/api/files/puzzles/12/x.webp');
  });
});
