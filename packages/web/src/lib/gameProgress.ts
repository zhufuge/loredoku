import {
  gamePlacementBoardSchema,
  type GamePlacementBoard,
} from '@loredoku/shared';

/**
 * docs/v0.6.2.md §3: 游戏页的摆放进度落在 localStorage 里，键按 slug 分，
 * 玩家关掉页面再回来接着摆 —— 头像、编号、禁止符号三样都在。
 *
 * 为什么是 localStorage 而不是服务端：玩家没有账号，进度只对这台浏览器有意义。
 *
 * 存档带**指纹**（`gridSize` + `participantCount`）。同一 slug 重新部署后网格或
 * 名单可能变了，此时旧坐标与新编号都不再有意义，整条存档按失效处理，不尝试
 * 「尽量恢复」——恢复出来的半截棋盘比空白更让人困惑。
 */

/** 存档结构变了就 +1；旧版本的存档一律丢弃（宁可空白，不可错乱）。 */
export const GAME_PROGRESS_VERSION = 1;
export const GAME_PROGRESS_PREFIX = 'loredoku.game.progress.';

export interface GameProgressMeta {
  /** 棋盘边长，坐标越界的格子会被清掉。 */
  gridSize: number;
  /** 名单人数，编号大于它的放置会被清掉。 */
  participantCount: number;
}

export interface StoredGameProgress extends GameProgressMeta {
  board: GamePlacementBoard;
  /** 「已提交」的勾要保持住，否则玩家回来看到勾没了会以为进度丢了。 */
  submitted: boolean;
}

export function gameProgressKey(slug: string): string {
  return `${GAME_PROGRESS_PREFIX}${slug}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * `"x,y"` 的严格解析。棋盘键只有这一种写法，别的一律当无效格。
 *
 * 注意 `Number('')` 是 0、`Number(' 1')` 是 1，`split` + 隐式转换会把
 * 稀奇古怪的键悄悄变成合法坐标，所以这里走正则。
 */
function parseCellKey(key: string): { x: number; y: number } | null {
  const match = /^(\d+),(\d+)$/.exec(key);
  if (!match) return null;
  return { x: Number(match[1]), y: Number(match[2]) };
}

/**
 * 按指纹清掉说不通的放置：越界的坐标、超出名单的编号、清空了的编号格。
 * 纯函数，读写两侧共用 —— 写之前也清一遍，存档里就不会留垃圾。
 */
export function sanitizeBoard(
  board: GamePlacementBoard,
  meta: GameProgressMeta,
): GamePlacementBoard {
  const clean: GamePlacementBoard = {};
  for (const [key, placement] of Object.entries(board)) {
    if (!placement) continue;
    const coord = parseCellKey(key);
    if (!coord) continue;
    if (coord.x >= meta.gridSize || coord.y >= meta.gridSize) continue;

    if (placement.kind === 'forbidden') {
      clean[key] = placement;
      continue;
    }
    if (placement.kind === 'participant') {
      if (placement.index > meta.participantCount) continue;
      clean[key] = placement;
      continue;
    }
    const entries = placement.entries.filter(
      (entry) => Number.isInteger(entry) && entry >= 1 && entry <= meta.participantCount,
    );
    if (entries.length > 0) {
      clean[key] = { kind: 'numbers', entries };
    }
  }
  return clean;
}

/**
 * 把读到的 JSON 变成存档，或 `null`（= 当作没有存档）。
 *
 * 分开导出是因为它不碰 `window`：测试能直接喂各种坏数据，不用搭 localStorage。
 */
export function parseStoredProgress(
  value: unknown,
  meta: GameProgressMeta,
): StoredGameProgress | null {
  if (!isRecord(value)) return null;
  if (value.v !== GAME_PROGRESS_VERSION) return null;
  if (value.gridSize !== meta.gridSize || value.participantCount !== meta.participantCount) {
    return null;
  }

  const parsed = gamePlacementBoardSchema.safeParse(value.board);
  if (!parsed.success) return null;

  const board = sanitizeBoard(parsed.data as GamePlacementBoard, meta);
  const submitted = value.submitted === true;
  // 空盘且没提交过 = 没有可恢复的东西。返回 null 而不是空存档，调用方据此
  // 走「新开一局」分支，连提示都不用给。
  if (!submitted && Object.keys(board).length === 0) return null;

  return {
    board,
    submitted,
    gridSize: meta.gridSize,
    participantCount: meta.participantCount,
  };
}

export function readGameProgress(
  slug: string,
  meta: GameProgressMeta,
): StoredGameProgress | null {
  if (typeof window === 'undefined' || slug.length === 0) return null;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(gameProgressKey(slug));
  } catch {
    // 无痕模式 / 站点数据被禁：读不到就当没存过。
    return null;
  }
  if (!raw) return null;
  try {
    return parseStoredProgress(JSON.parse(raw), meta);
  } catch {
    return null;
  }
}

/**
 * 写存档。空盘且没提交过 → 删掉整条键：玩家清空棋盘后不该在 localStorage
 * 里留一条空记录（下次读到它还得再判一次空）。
 *
 * 写失败（配额满、隐私模式）静默吞掉：**玩得下去**比存得下来重要。
 */
export function writeGameProgress(slug: string, progress: StoredGameProgress): void {
  if (typeof window === 'undefined' || slug.length === 0) return;
  const key = gameProgressKey(slug);
  const board = sanitizeBoard(progress.board, progress);
  const empty = Object.keys(board).length === 0;
  try {
    if (empty && !progress.submitted) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(
      key,
      JSON.stringify({
        v: GAME_PROGRESS_VERSION,
        gridSize: progress.gridSize,
        participantCount: progress.participantCount,
        submitted: progress.submitted,
        board,
      }),
    );
  } catch {
    // 见上：存档失败不打扰玩家。
  }
}
