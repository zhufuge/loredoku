import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearGameTimer,
  formatElapsed,
  GAME_TIMER_PREFIX,
  gameTimerKey,
  parseStoredTimer,
  readGameTimer,
  writeGameTimer,
} from './gameTimer';

/**
 * v0.7.11：游戏用时存档。
 *
 * 存的是**累计毫秒**，不是开始时间戳 —— 跨会话的墙钟差里混着睡觉、吃饭的时间，
 * 那不是玩家在想的时长。指纹（网格 / 名单）与摆放存档共用一份：同一路径重新
 * 部署成另一个谜题后，旧计时不再属于这一局。
 */

const META = { gridSize: 9, participantCount: 5 };

describe('gameTimer — 读写的边界', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('round-trips an elapsed value', () => {
    writeGameTimer('night-train', META, 187_400);
    expect(readGameTimer('night-train', META)).toBe(187_400);
    expect(window.localStorage.getItem(gameTimerKey('night-train'))).not.toBeNull();
    expect(gameTimerKey('night-train').startsWith(GAME_TIMER_PREFIX)).toBe(true);
  });

  it('zero deletes the key instead of storing 「用了 0 秒」', () => {
    writeGameTimer('night-train', META, 5_000);
    writeGameTimer('night-train', META, 0);
    expect(window.localStorage.getItem(gameTimerKey('night-train'))).toBeNull();
    expect(readGameTimer('night-train', META)).toBe(0);
  });

  it('drops a record that belongs to another grid or roster', () => {
    writeGameTimer('night-train', META, 9_000);
    expect(readGameTimer('night-train', { gridSize: 12, participantCount: 5 })).toBe(0);
    expect(readGameTimer('night-train', { gridSize: 9, participantCount: 4 })).toBe(0);
  });

  it('floors fractional milliseconds and ignores garbage', () => {
    expect(parseStoredTimer({ ...META, elapsedMs: 1_234.9 }, META)).toBe(1234);
    expect(parseStoredTimer({ ...META, elapsedMs: -1 }, META)).toBe(0);
    expect(parseStoredTimer({ ...META, elapsedMs: Number.NaN }, META)).toBe(0);
    expect(parseStoredTimer({ ...META, elapsedMs: '9000' }, META)).toBe(0);
    expect(parseStoredTimer(null, META)).toBe(0);
    expect(parseStoredTimer([], META)).toBe(0);
  });

  it('treats unreadable JSON as no timer at all', () => {
    window.localStorage.setItem(gameTimerKey('night-train'), '{not json');
    expect(readGameTimer('night-train', META)).toBe(0);
  });

  it('clears on demand', () => {
    writeGameTimer('night-train', META, 42_000);
    clearGameTimer('night-train');
    expect(readGameTimer('night-train', META)).toBe(0);
  });

  it('never touches localStorage for an empty slug', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    writeGameTimer('', META, 1_000);
    clearGameTimer('');
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });
});

describe('formatElapsed — 秒级显示', () => {
  it('shows mm:ss under an hour', () => {
    expect(formatElapsed(0)).toBe('00:00');
    expect(formatElapsed(7_000)).toBe('00:07');
    expect(formatElapsed(187_000)).toBe('03:07');
    expect(formatElapsed(3_599_000)).toBe('59:59');
  });

  it('adds the hour once it overflows', () => {
    expect(formatElapsed(3_600_000)).toBe('1:00:00');
    expect(formatElapsed(3_787_000)).toBe('1:03:07');
  });

  it('clamps garbage to 00:00', () => {
    expect(formatElapsed(-5)).toBe('00:00');
  });
});
