/**
 * OPT-H04 §4.2 (docs/v0.4.2.md §4): the map **grid card** shows a relative
 * timestamp — 「刚刚 / 5 分钟前 / 3 天前」 — because "how fresh is this map" is
 * what a browsing author actually asks. Past a month the relative form stops
 * meaning anything, so it falls back to an absolute `YYYY-MM-DD`. The list view
 * keeps the absolute `formatDateTime`; only the card switched.
 *
 * Pure and `now`-injectable, so every threshold is unit-testable.
 */

/** Below one minute → 「刚刚」. */
export const RELATIVE_MINUTE_MS = 60_000;
/** Below one hour → 「N 分钟前」. */
export const RELATIVE_HOUR_MS = 60 * RELATIVE_MINUTE_MS;
/** Below one day → 「N 小时前」. */
export const RELATIVE_DAY_MS = 24 * RELATIVE_HOUR_MS;
/** At or beyond this many days → the absolute date takes over. */
export const RELATIVE_DAY_LIMIT = 30;

export function formatRelativeTime(value: string, now: Date = new Date()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const diff = now.getTime() - date.getTime();
  // A future timestamp (clock skew) reads as brand new rather than negatively old.
  if (diff < RELATIVE_MINUTE_MS) return '刚刚';

  const minutes = Math.floor(diff / RELATIVE_MINUTE_MS);
  if (minutes < 60) return `${minutes} 分钟前`;

  const hours = Math.floor(diff / RELATIVE_HOUR_MS);
  if (hours < 24) return `${hours} 小时前`;

  const days = Math.floor(diff / RELATIVE_DAY_MS);
  if (days < RELATIVE_DAY_LIMIT) return `${days} 天前`;

  return formatDateOnly(date);
}

/** `YYYY-MM-DD` in local time — the fallback once the gap exceeds a month. */
export function formatDateOnly(date: Date): string {
  const pad = (input: number): string => String(input).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
