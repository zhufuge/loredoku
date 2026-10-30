import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  forgetThemeCode,
  readLastThemeCode,
  rememberThemeCode,
  workshopPath,
} from './workspace';

/**
 * v0.8.3（docs/v0.8.3.md §13）：`loredoku.lastTheme` 是「上一次在哪个工作空间」，
 * 也是旧地址与「返回工坊」的兜底目标。
 *
 * 它是一份**可以过期的记忆**：主题被删掉之后，键里留着的编码就成了一个不存在的
 * 地址。这一组钉住「忘掉」这件事的边界 —— 只忘被删的那一个，别的一概不动。
 */
describe('主题编码记忆（lib/workspace）', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('记住之后能读回来；没记过就是 null', () => {
    expect(readLastThemeCode()).toBeNull();
    rememberThemeCode('hlm');
    expect(readLastThemeCode()).toBe('hlm');
  });

  it('记得住代码就拼带编码的地址，记不住就回 `/`（由入口再挑一次）', () => {
    expect(workshopPath('maps')).toBe('/');
    rememberThemeCode('hlm');
    expect(workshopPath('maps')).toBe('/hlm/maps');
    // 显式给了编码时，它优先于记忆 —— 调用方比 localStorage 更清楚自己在哪。
    expect(workshopPath('maps', 'default')).toBe('/default/maps');
  });

  it('忘掉被删掉的那个编码', () => {
    rememberThemeCode('gone');
    forgetThemeCode('gone');

    expect(readLastThemeCode()).toBeNull();
    // 记住的东西没了，地址就落回入口 —— 而不是拼出 `/gone/maps`。
    expect(workshopPath('overview')).toBe('/');
  });

  /**
   * 只忘匹配的那一个。删 A 却在另一个标签页开着 B 时，把 B 的记忆一起抹掉，
   * 那一边的旧地址与「返回工坊」就会无谓地跳一次。
   */
  it('忘掉一个别的编码时，记忆原样保留', () => {
    rememberThemeCode('hlm');
    forgetThemeCode('gone');

    expect(readLastThemeCode()).toBe('hlm');
    expect(workshopPath('overview')).toBe('/hlm/overview');
  });
});
