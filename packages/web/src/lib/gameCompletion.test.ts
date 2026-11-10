import { beforeEach, describe, expect, it } from 'vitest';
import {
  GAME_COMPLETION_VERSION,
  clearGameCompletion,
  gameCompletionKey,
  parseStoredCompletion,
  readGameCompletion,
  recordGameCompletion,
} from './gameCompletion';

/**
 * v0.9.5：通过记录的读写。
 *
 * 这里钉的都是**行为**：读回来的是什么、坏数据怎么处理、以及「首次为准」这条
 * 规矩。键的形状只经由 `gameCompletionKey` 断言一次（它是别的模块拼地址的唯一
 * 去处，改名字有测试会响）。
 */

const META = { gridSize: 9 };

describe('通过记录（v0.9.5）', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('键按存档键分：线上 slug 与播放器的 bundle 键互不相通', () => {
    expect(gameCompletionKey('puzzle-dao')).toBe('loredoku.game.completed.puzzle-dao');
    expect(gameCompletionKey('bundle:hlm:puzzle-dao')).toBe(
      'loredoku.game.completed.bundle:hlm:puzzle-dao',
    );
  });

  it('写进去的能读回来：用时、完成时刻、印章地址', () => {
    recordGameCompletion('puzzle-dao', META, {
      elapsedMs: 187_400,
      stampUrl: '/api/files/themes/2/tool-icons/submit/a.webp',
    });

    const read = readGameCompletion('puzzle-dao', META);
    expect(read?.elapsedMs).toBe(187_400);
    expect(read?.stampUrl).toBe('/api/files/themes/2/tool-icons/submit/a.webp');
    // 时刻是「现在」，只要求它是一个能被解析的 ISO。
    expect(Number.isNaN(new Date(read?.completedAt ?? '').getTime())).toBe(false);
  });

  it('没配印也能通过：stampUrl 是 null，记录照样成立', () => {
    recordGameCompletion('puzzle-dao', META, { elapsedMs: 1000, stampUrl: null });
    expect(readGameCompletion('puzzle-dao', META)).toEqual({
      elapsedMs: 1000,
      completedAt: expect.any(String),
      stampUrl: null,
    });
  });

  /**
   * 卡片上那枚印是**凭证**，不是排行榜：重玩一次更快，也不该把已写的数字改小。
   * 这条与 v0.7.11「提交不落盘」同一种态度 —— 界面不替玩家改成绩。
   */
  /**
   * v0.9.6：**以最后一次为准**（v0.9.5 是首次为准）。
   *
   * 用户给的规则：「完成时间：记录最后一次完成时间（重复完成，仅记录最后一次）」
   * —— 重玩通关就是又结了一次案，卡片该跟着最新的那一次走。
   */
  it('以最后一次为准：重复完成覆盖成最新那一次', () => {
    recordGameCompletion('puzzle-dao', META, { elapsedMs: 5000, stampUrl: null });
    const second = recordGameCompletion('puzzle-dao', META, { elapsedMs: 900, stampUrl: '/x.webp' });

    expect(second?.elapsedMs).toBe(900);
    expect(second?.stampUrl).toBe('/x.webp');
    expect(readGameCompletion('puzzle-dao', META)?.elapsedMs).toBe(900);
  });

  it('网格变了 = 另一道题：整条作废', () => {
    recordGameCompletion('puzzle-dao', META, { elapsedMs: 5000, stampUrl: null });
    expect(readGameCompletion('puzzle-dao', { gridSize: 5 })).toBeNull();
  });

  it('画布还没算出来（gridSize 为 0）时不写 —— 写下去也读不回来', () => {
    expect(recordGameCompletion('puzzle-dao', { gridSize: 0 }, { elapsedMs: 1, stampUrl: null })).toBeNull();
    expect(window.localStorage.getItem(gameCompletionKey('puzzle-dao'))).toBeNull();
  });

  it('清掉之后就是没通过', () => {
    recordGameCompletion('puzzle-dao', META, { elapsedMs: 5000, stampUrl: null });
    clearGameCompletion('puzzle-dao');
    expect(readGameCompletion('puzzle-dao', META)).toBeNull();
  });

  describe('坏数据一律当「没通过」，不抛错', () => {
    const bad: Array<[string, unknown]> = [
      ['不是对象', 'nope'],
      ['数组', []],
      ['版本对不上', { v: GAME_COMPLETION_VERSION + 1, gridSize: 9, elapsedMs: 1 }],
      ['网格对不上', { v: GAME_COMPLETION_VERSION, gridSize: 5, elapsedMs: 1 }],
      ['用时是负数', { v: GAME_COMPLETION_VERSION, gridSize: 9, elapsedMs: -1 }],
      ['用时不是数字', { v: GAME_COMPLETION_VERSION, gridSize: 9, elapsedMs: '9' }],
      ['用时是 NaN', { v: GAME_COMPLETION_VERSION, gridSize: 9, elapsedMs: Number.NaN }],
    ];

    for (const [label, value] of bad) {
      it(label, () => {
        expect(parseStoredCompletion(value, META)).toBeNull();
      });
    }

    it('localStorage 里躺着一串坏 JSON', () => {
      window.localStorage.setItem(gameCompletionKey('puzzle-dao'), '{oops');
      expect(readGameCompletion('puzzle-dao', META)).toBeNull();
    });

    /** 时刻坏了不该让整条记录失效 —— 用时和印都还在，标题那一行少一句而已。 */
    it('完成时刻说不通 → 只丢那一格', () => {
      const parsed = parseStoredCompletion(
        { v: GAME_COMPLETION_VERSION, gridSize: 9, elapsedMs: 10, completedAt: 'not-a-date' },
        META,
      );
      expect(parsed).toEqual({ elapsedMs: 10, completedAt: '', stampUrl: null });
    });
  });
});
