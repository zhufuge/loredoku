import type { GameProgressMeta } from './gameProgress';

/**
 * v0.7.11：游戏页的**计时**（秒级）。
 *
 * 需求是「打开游戏时开始，关闭时记到本地，第二次进来接着走，直到点提交」，
 * 所以这里存的是**累计用时**而不是开始时间戳：跨会话的墙钟差里混着睡觉、吃饭、
 * 换设备的时间，那不是玩家在想的时长。每秒落一次盘，关页面时再补一次。
 *
 * 键按 slug 分，并带与摆放存档同一份指纹（网格 / 名单）—— 同一路径重新部署成
 * 另一个谜题后，旧计时不再属于这一局，整条作废。
 */

export const GAME_TIMER_PREFIX = 'loredoku.game.timer.';

export interface StoredGameTimer extends GameProgressMeta {
  elapsedMs: number;
  /**
   * v0.9.6：**最后离开时间** —— 写这一条的那一刻（ISO）。
   *
   * 和累计用时同一条存档：两者都在「离开这一局」时落盘，分开两条键只会让
   * 「什么时候写哪个」多一种可能。列表页的卡片读它（有完成记录时改用完成时间）。
   */
  leftAt?: string;
}

export function gameTimerKey(slug: string): string {
  return `${GAME_TIMER_PREFIX}${slug}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 读到的 JSON → 毫秒；任何说不通的东西都当「没有计时」（0）。 */
export function parseStoredTimer(value: unknown, meta: GameProgressMeta): number {
  if (!isRecord(value)) return 0;
  if (value.gridSize !== meta.gridSize || value.participantCount !== meta.participantCount) {
    return 0;
  }
  const elapsed = value.elapsedMs;
  if (typeof elapsed !== 'number' || !Number.isFinite(elapsed) || elapsed < 0) return 0;
  return Math.floor(elapsed);
}

export function readGameTimer(slug: string, meta: GameProgressMeta): number {
  if (typeof window === 'undefined' || slug.length === 0) return 0;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(gameTimerKey(slug));
  } catch {
    return 0;
  }
  if (!raw) return 0;
  try {
    return parseStoredTimer(JSON.parse(raw), meta);
  } catch {
    return 0;
  }
}

/**
 * 写计时；`0` 时只留 `leftAt`（v0.9.6）—— 「刚开了一局就关掉」也是「来玩过」，
 * 卡片该显示最后离开时间；而 0 秒的**成绩**仍然不该留（重新开始不该出现「用时
 * 00:00」）。所以这里不再整条删键：有 `leftAt` 就写一条只带它的记录。
 */
export function writeGameTimer(
  slug: string,
  meta: GameProgressMeta,
  elapsedMs: number,
): void {
  if (typeof window === 'undefined' || slug.length === 0) return;
  const key = gameTimerKey(slug);
  const elapsed = Math.max(0, Math.floor(elapsedMs));
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        gridSize: meta.gridSize,
        participantCount: meta.participantCount,
        elapsedMs: elapsed,
        leftAt: new Date().toISOString(),
      } satisfies StoredGameTimer),
    );
  } catch {
    // 与摆放存档同一套态度：存不下不打扰玩家。
  }
}

export function clearGameTimer(slug: string): void {
  if (typeof window === 'undefined' || slug.length === 0) return;
  try {
    window.localStorage.removeItem(gameTimerKey(slug));
  } catch {
    // 见上。
  }
}

/**
 * v0.9.6：**只把计时归零，保留最后离开时间**。
 *
 * 「重新开始」= 这一局从 00:00 重来，但它仍然是「我来玩过」—— 卡片上那一格该
 * 显示的是「上次玩到几点」，不该因为点了重新开始就回到「从没玩过」（`00:00`）。
 * 所以清掉 `elapsedMs`、把 `leftAt` 刷新成现在。
 */
export function resetGameTimer(slug: string, meta: GameProgressMeta): void {
  if (typeof window === 'undefined' || slug.length === 0) return;
  try {
    window.localStorage.setItem(
      gameTimerKey(slug),
      JSON.stringify({
        gridSize: meta.gridSize,
        participantCount: meta.participantCount,
        elapsedMs: 0,
        leftAt: new Date().toISOString(),
      } satisfies StoredGameTimer),
    );
  } catch {
    // 见上。
  }
}

/**
 * v0.9.6：**最后离开时的计时读数** —— 上次离开这一关时表上显示的那个 `mm:ss`。
 *
 * 用户规范里的 a / b / c 都是**计时读数，不是墙钟时刻**：「离开时记录时间 a」
   「再次进入，从 a 开始继续」「提交暂停计时 b」「通过记录完成时间 c」。
 *
 * 而 `readGameTimer` 读到的 `elapsedMs` 正是 a —— 离开时落盘的累计用时。所以
   这里不另存一份，直接读同一条存档。指纹只校验 `gridSize`：列表页的两份数据
   （`MapGameSummary` / 播放器卡片）都给得出网格，名单人数只有前者有；多要一项
   会让播放器那边只能传假值，反而更脆。
 *
 * 返回 `0` 也表示「来玩过」—— 刚开一局就离开，卡片该显示 `00:00` 而不是空白。
 */
export function readLastLeftElapsed(
  slug: string,
  meta: { gridSize: number },
): number | null {
  if (typeof window === 'undefined' || slug.length === 0) return null;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(gameTimerKey(slug));
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    if (parsed.gridSize !== meta.gridSize) return null;
    const elapsed = parsed.elapsedMs;
    if (typeof elapsed !== 'number' || !Number.isFinite(elapsed) || elapsed < 0) return null;
    return Math.floor(elapsed);
  } catch {
    return null;
  }
}

/**
 * v0.9.6：**最后离开时刻**（墙钟，ISO）—— 只给卡片的 `title` 用，不占版面。
 * 卡片主体显示的是 {@link readLastLeftElapsed} 那个 `mm:ss` 读数。
 */
export function readLastLeftAt(
  slug: string,
  meta: { gridSize: number },
): string | null {
  if (typeof window === 'undefined' || slug.length === 0) return null;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(gameTimerKey(slug));
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    if (parsed.gridSize !== meta.gridSize) return null;
    const value = parsed.leftAt;
    if (typeof value !== 'string') return null;
    return Number.isNaN(new Date(value).getTime()) ? null : value;
  } catch {
    return null;
  }
}

/**
 * 秒级显示。**没超过一小时是 `mm:ss`（`03:07`），超过就是 `hh:mm:ss`
 * （`01:03:07`）** —— v0.9.7 明确要求小时也补两位，之前是 `1:03:07`，
 * 与 `mm:ss` 那两段等宽不统一，秒针跳到 10 点以后整行会左右抖。
 *
 * 数字等宽由调用方给（`tabular-nums`），否则秒针跳动时整行会左右抖。
 */
export function formatElapsed(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number): string => String(value).padStart(2, '0');
  return hours > 0
    ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}
