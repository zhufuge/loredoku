import { describe, expect, it } from 'vitest';
import {
  THEME_GAME_LIST_PASSED_FALLBACK,
  THEME_GAME_LIST_PLAYABLE_FALLBACK,
} from './constants/game';
import { formatGameListCount, resolveGameListTexts } from './gameList';

/**
 * 列表页顶上那两行字。
 *
 * 这一层是纯函数，只回答两个问题：没配过时用哪句、配过时怎么把关数塞进去。
 * 页面那边只负责把它们画出来。
 */
describe('resolveGameListTexts', () => {
  it('没配过就是内置那两句', () => {
    expect(resolveGameListTexts(undefined)).toEqual({
      playable: THEME_GAME_LIST_PLAYABLE_FALLBACK,
      passed: THEME_GAME_LIST_PASSED_FALLBACK,
    });
    expect(resolveGameListTexts(null)).toEqual({
      playable: THEME_GAME_LIST_PLAYABLE_FALLBACK,
      passed: THEME_GAME_LIST_PASSED_FALLBACK,
    });
  });

  it('只配一句时，另一句仍用内置的', () => {
    expect(resolveGameListTexts({ playable: '共 {n} 回' })).toEqual({
      playable: '共 {n} 回',
      passed: THEME_GAME_LIST_PASSED_FALLBACK,
    });
  });

  it('空串与纯空白都算「没配」', () => {
    expect(resolveGameListTexts({ playable: '', passed: '   ' })).toEqual({
      playable: THEME_GAME_LIST_PLAYABLE_FALLBACK,
      passed: THEME_GAME_LIST_PASSED_FALLBACK,
    });
  });

  it('配过的那句两头的空白削掉', () => {
    expect(resolveGameListTexts({ playable: '  共 {n} 回  ' }).playable).toBe('共 {n} 回');
  });
});

describe('formatGameListCount', () => {
  it('把 {n} 换成数字', () => {
    expect(formatGameListCount('{n} 关可玩', 6)).toBe('6 关可玩');
    expect(formatGameListCount('已通过 {n} 关', 0)).toBe('已通过 0 关');
  });

  it('多个 {n} 全换 —— 不是只换第一个', () => {
    expect(formatGameListCount('{n} 关里有 {n} 关能玩', 6)).toBe('6 关里有 6 关能玩');
  });

  it('没有 {n} 就原样返回', () => {
    expect(formatGameListCount('共若干回', 6)).toBe('共若干回');
  });

  it('数字是 0 也照样换进去，不留空', () => {
    expect(formatGameListCount('已通过 {n} 关', 0)).toBe('已通过 0 关');
  });
});
