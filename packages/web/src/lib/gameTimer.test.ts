import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearGameTimer,
  formatElapsed,
  GAME_TIMER_PREFIX,
  gameTimerKey,
  parseStoredTimer,
  readGameTimer,
  readLastLeftAt,
  readLastLeftElapsed,
  resetGameTimer,
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

  /**
   * v0.9.6：**写 0 秒不再删键**，而是留一条只带 `leftAt` 的记录 ——
   * 「刚开了一局就关掉」也是「来玩过」，卡片该显示最后离开时间；但 0 秒的
   * **成绩**仍然不该留（重新开始后不该出现「用时 00:00」）。
   */
  it('zero keeps only the last-left stamp instead of storing a 0-second score', () => {
    writeGameTimer('night-train', META, 5_000);
    writeGameTimer('night-train', META, 0);

    const raw = window.localStorage.getItem(gameTimerKey('night-train'));
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string).elapsedMs).toBe(0);
    // 成绩读回来是 0（不显示「用时 00:00」），但离开时间在。
    expect(readGameTimer('night-train', META)).toBe(0);
    expect(readLastLeftAt('night-train', META)).not.toBeNull();
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

  it('超过一小时用 hh:mm:ss（小时也补两位，v0.9.7）', () => {
    expect(formatElapsed(3_600_000)).toBe('01:00:00');
    expect(formatElapsed(3_787_000)).toBe('01:03:07');
    // 没超过一小时仍是 mm:ss。
    expect(formatElapsed(3_599_000)).toBe('59:59');
  });

  it('clamps garbage to 00:00', () => {
    expect(formatElapsed(-5)).toBe('00:00');
  });
});

/**
 * v0.9.6：**三个时间**的存储契约。
 *
 * 规范：首次进入从 00:00 开始；离开记录 a；再进入从 a 继续；提交暂停 b；通过
 * 记为 c（最后一次）；未完成继续从 b、重新开始从 00:00；已完成再进入定格 00:00。
 *
 * 这里只钉存储层能负责的两件事：离开读数 a 是 `elapsedMs`（`mm:ss` 而不是墙钟），
 * 以及「重新开始」只归零用时、不把「来玩过」这件事一起抹掉。
 */
describe('最后离开时间（v0.9.6）', () => {
  it('读的是离开时的计时读数（mm:ss 的毫秒数），不是墙钟', () => {
    writeGameTimer('night-train', META, 187_000);
    expect(readLastLeftElapsed('night-train', META)).toBe(187_000);
    expect(formatElapsed(readLastLeftElapsed('night-train', META) ?? 0)).toBe('03:07');
    // 墙钟时刻另有一份，只给 title 用。
    expect(readLastLeftAt('night-train', META)).not.toBeNull();
  });

  it('网格对不上就是另一道题：读数与时刻都不认', () => {
    writeGameTimer('night-train', META, 187_000);
    expect(readLastLeftElapsed('night-train', { gridSize: 12 })).toBeNull();
  });

  it('重新开始：用时归零，但仍然算「来玩过」', () => {
    writeGameTimer('night-train', META, 187_000);
    resetGameTimer('night-train', META);

    expect(readGameTimer('night-train', META)).toBe(0);
    // 卡片那一格仍有读数（00:00）与离开时刻，不会退回「从没玩过」。
    expect(readLastLeftElapsed('night-train', META)).toBe(0);
    expect(readLastLeftAt('night-train', META)).not.toBeNull();
  });
});