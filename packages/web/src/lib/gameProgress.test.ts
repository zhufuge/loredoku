import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GamePlacementBoard } from '@loredoku/shared';
import {
  GAME_PROGRESS_PREFIX,
  GAME_PROGRESS_VERSION,
  gameProgressKey,
  parseStoredProgress,
  readGameProgress,
  sanitizeBoard,
  writeGameProgress,
  type StoredGameProgress,
} from './gameProgress';

/**
 * docs/v0.6.2.md §3：存档的规则都是「坏数据一律当没存过」。
 *
 * 这些用例钉的是**边界**，不是实现：越界坐标、超出名单的编号、换了网格的
 * 旧存档、写坏的 JSON、配额满，统统不能把玩家拦在游戏外面。
 */

const meta = { gridSize: 9, participantCount: 4 };

function payload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    v: GAME_PROGRESS_VERSION,
    gridSize: meta.gridSize,
    participantCount: meta.participantCount,
    board: {},
    ...overrides,
  };
}

function stored(overrides: Partial<StoredGameProgress> = {}): StoredGameProgress {
  return {
    board: { '1,1': { kind: 'participant', index: 2 }, '2,2': { kind: 'forbidden' } },
    gridSize: meta.gridSize,
    participantCount: meta.participantCount,
    ...overrides,
  };
}

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('sanitizeBoard', () => {
  it('keeps the three kinds of placement inside the board', () => {
    const board: GamePlacementBoard = {
      '1,1': { kind: 'participant', index: 4 },
      '2,2': { kind: 'numbers', entries: [1, 3] },
      '3,3': { kind: 'forbidden' },
    };
    expect(sanitizeBoard(board, meta)).toEqual(board);
  });

  it('drops cells outside the grid and keys that are not coordinates', () => {
    const clean = sanitizeBoard(
      {
        '9,0': { kind: 'forbidden' },
        '0,9': { kind: 'forbidden' },
        '-1,0': { kind: 'forbidden' },
        '1 ,1': { kind: 'forbidden' },
        'a,b': { kind: 'forbidden' },
        '0,0': { kind: 'forbidden' },
      },
      meta,
    );
    expect(Object.keys(clean)).toEqual(['0,0']);
  });

  it('drops numbers that point outside the roster, keeping the rest', () => {
    const clean = sanitizeBoard(
      {
        '0,0': { kind: 'numbers', entries: [1, 7] },
        '1,0': { kind: 'numbers', entries: [7] },
        '2,0': { kind: 'participant', index: 5 },
      },
      meta,
    );
    expect(clean).toEqual({ '0,0': { kind: 'numbers', entries: [1] } });
  });
});

describe('parseStoredProgress', () => {
  it('accepts a well-formed payload', () => {
    const board = { '4,4': { kind: 'numbers', entries: [2, 3] } };
    expect(parseStoredProgress(payload({ board }), meta)).toEqual({
      board,
      gridSize: 9,
      participantCount: 4,
    });
  });

  it('rejects a payload from another version', () => {
    expect(parseStoredProgress(payload({ v: GAME_PROGRESS_VERSION + 1 }), meta)).toBeNull();
  });

  it('rejects a payload saved on a different board or roster', () => {
    expect(parseStoredProgress(payload({ gridSize: 12 }), meta)).toBeNull();
    expect(parseStoredProgress(payload({ participantCount: 6 }), meta)).toBeNull();
  });

  it('rejects a board that fails the schema', () => {
    const board = { '0,0': { kind: 'numbers', entries: 'nope' } };
    expect(parseStoredProgress(payload({ board }), meta)).toBeNull();
  });

  it('rejects anything that is not an object', () => {
    for (const bad of [null, undefined, 3, 'x', []]) {
      expect(parseStoredProgress(bad, meta)).toBeNull();
    }
  });

  it('treats an empty board as "nothing to restore"', () => {
    // v0.7.11：存档里只剩棋盘，「提交过」不再是一条能独立存在的记录 ——
    // 空盘就是空盘，没什么可恢复的。
    expect(parseStoredProgress(payload(), meta)).toBeNull();
    expect(parseStoredProgress(payload({ submitted: true }), meta)).toBeNull();
  });

  it('prunes stale cells instead of dropping the whole save', () => {
    const board = {
      '0,0': { kind: 'participant', index: 1 },
      '20,20': { kind: 'participant', index: 1 },
      '1,0': { kind: 'numbers', entries: [9] },
    };
    expect(parseStoredProgress(payload({ board }), meta)?.board).toEqual({
      '0,0': { kind: 'participant', index: 1 },
    });
  });
});

describe('localStorage round-trip', () => {
  it('writes under a per-slug key and reads the same board back', () => {
    const progress = stored();
    writeGameProgress('night-train', progress);

    expect(window.localStorage.getItem(gameProgressKey('night-train'))).not.toBeNull();
    expect(gameProgressKey('night-train').startsWith(GAME_PROGRESS_PREFIX)).toBe(true);
    expect(readGameProgress('night-train', meta)).toEqual(progress);
    // 另一个 slug 不会串味。
    expect(readGameProgress('other-game', meta)).toBeNull();
  });

  it('removes the key when the board is empty', () => {
    writeGameProgress('night-train', stored());
    writeGameProgress('night-train', stored({ board: {} }));
    expect(window.localStorage.getItem(gameProgressKey('night-train'))).toBeNull();
  });

  it('keeps the auto flag of a swept forbidden cell (v0.7.11)', () => {
    // 自动 `×` 的标记必须活着回读：头像搬家时靠它决定哪些 `×` 可以回滚。
    writeGameProgress('night-train', stored({ board: { '2,2': { kind: 'forbidden', auto: true } } }));
    expect(readGameProgress('night-train', meta)?.board).toEqual({
      '2,2': { kind: 'forbidden', auto: true },
    });
  });

  it('ignores a corrupted or hand-edited string', () => {
    window.localStorage.setItem(gameProgressKey('night-train'), '{not json');
    expect(readGameProgress('night-train', meta)).toBeNull();

    window.localStorage.setItem(gameProgressKey('night-train'), '"a string"');
    expect(readGameProgress('night-train', meta)).toBeNull();
  });

  it('drops a save whose fingerprint no longer matches the game', () => {
    writeGameProgress('night-train', stored());
    expect(readGameProgress('night-train', { gridSize: 12, participantCount: 4 })).toBeNull();
    expect(readGameProgress('night-train', { gridSize: 9, participantCount: 6 })).toBeNull();
  });

  it('never throws when the browser refuses to store', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => writeGameProgress('night-train', stored())).not.toThrow();
  });

  it('never throws when the browser refuses to read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(readGameProgress('night-train', meta)).toBeNull();
  });

  it('does nothing for an empty slug', () => {
    writeGameProgress('', stored());
    expect(window.localStorage.length).toBe(0);
    expect(readGameProgress('', meta)).toBeNull();
  });
});
