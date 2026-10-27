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

/** 写计时；`0` 直接删键 —— 重新开始时不该留一条「用了 0 秒」的记录。 */
export function writeGameTimer(
  slug: string,
  meta: GameProgressMeta,
  elapsedMs: number,
): void {
  if (typeof window === 'undefined' || slug.length === 0) return;
  const key = gameTimerKey(slug);
  const elapsed = Math.max(0, Math.floor(elapsedMs));
  try {
    if (elapsed === 0) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(
      key,
      JSON.stringify({
        gridSize: meta.gridSize,
        participantCount: meta.participantCount,
        elapsedMs: elapsed,
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
 * 秒级显示。一小时以内是 `mm:ss`（`03:07`），超过就补上小时（`1:03:07`）——
 * 数字等宽由调用方给（`tabular-nums`），否则秒针跳动时整行会左右抖。
 */
export function formatElapsed(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number): string => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}
