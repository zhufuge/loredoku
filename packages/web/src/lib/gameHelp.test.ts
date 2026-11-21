import { afterEach, describe, expect, it, vi } from 'vitest';
import { GAME_HELP_SEEN_KEY, markGameHelpSeen, readGameHelpSeen } from './gameHelp';

/**
 * 玩法说明「看过没有」的记账。
 *
 * 只验两件事：写进去之后读得出来；读不出来 / 写不进去时**不炸**、当作没看过
 * （隐私模式、存储被禁的那一路 —— 那种环境下页面还得能玩）。
 */
describe('gameHelp — 玩法说明看过没有（v0.11.7）', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('没记过就是没看过', () => {
    expect(readGameHelpSeen()).toBe(false);
  });

  it('记过之后读得出来', () => {
    markGameHelpSeen();
    expect(readGameHelpSeen()).toBe(true);
  });

  it('记的键是 loredoku.game.helpSeen，值是 1', () => {
    markGameHelpSeen();
    expect(window.localStorage.getItem(GAME_HELP_SEEN_KEY)).toBe('1');
  });

  it('别的值不算看过：只认字符串 1', () => {
    window.localStorage.setItem(GAME_HELP_SEEN_KEY, 'true');
    expect(readGameHelpSeen()).toBe(false);
  });

  it('读存储抛错（隐私模式）：当作没看过，不往外抛', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(() => readGameHelpSeen()).not.toThrow();
    expect(readGameHelpSeen()).toBe(false);
  });

  it('写存储抛错：不往外抛，这一局照常玩', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => markGameHelpSeen()).not.toThrow();
  });
});
