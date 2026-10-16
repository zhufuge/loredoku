import { describe, expect, it } from 'vitest';
import {
  RELATIVE_DAY_LIMIT,
  RELATIVE_MINUTE_MS,
  formatDateOnly,
  formatRelativeTime,
} from './relativeTime';

/**
 * OPT-H04（docs/v0.4.2.md §4）：地图**卡片**用相对时间（「3 天前更新」），
 * 列表行保留绝对时间。超过一个月相对时间就没有信息量了，回退 `YYYY-MM-DD`。
 * `now` 可注入，所以每个阈值都能精确断言。
 */

const NOW = new Date('2026-10-16T12:00:00');

/** `formatRelativeTime` 的入参是 ISO 字符串，这里按「距今多少毫秒」构造。 */
function ago(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString();
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('formatRelativeTime (OPT-H04 §4.2)', () => {
  it('says 刚刚 below one minute', () => {
    expect(formatRelativeTime(ago(0), NOW)).toBe('刚刚');
    expect(formatRelativeTime(ago(59_000), NOW)).toBe('刚刚');
  });

  it('counts minutes below one hour', () => {
    expect(formatRelativeTime(ago(MINUTE), NOW)).toBe('1 分钟前');
    expect(formatRelativeTime(ago(5 * MINUTE), NOW)).toBe('5 分钟前');
    expect(formatRelativeTime(ago(59 * MINUTE), NOW)).toBe('59 分钟前');
  });

  it('counts hours below one day', () => {
    expect(formatRelativeTime(ago(HOUR), NOW)).toBe('1 小时前');
    expect(formatRelativeTime(ago(23 * HOUR), NOW)).toBe('23 小时前');
  });

  it('counts days below the month limit', () => {
    expect(formatRelativeTime(ago(DAY), NOW)).toBe('1 天前');
    expect(formatRelativeTime(ago(3 * DAY), NOW)).toBe('3 天前');
    expect(formatRelativeTime(ago((RELATIVE_DAY_LIMIT - 1) * DAY), NOW)).toBe('29 天前');
  });

  it('falls back to an absolute date at the month limit', () => {
    const at = new Date(NOW.getTime() - RELATIVE_DAY_LIMIT * DAY);
    expect(formatRelativeTime(ago(RELATIVE_DAY_LIMIT * DAY), NOW)).toBe(formatDateOnly(at));
    expect(formatRelativeTime(ago(400 * DAY), NOW)).toBe(formatDateOnly(new Date(NOW.getTime() - 400 * DAY)));
  });

  it('treats a future timestamp (clock skew) as brand new', () => {
    expect(formatRelativeTime(ago(-5 * MINUTE), NOW)).toBe('刚刚');
  });

  it('passes an unparsable value through untouched', () => {
    expect(formatRelativeTime('not-a-date', NOW)).toBe('not-a-date');
  });

  it('the boundary constants agree with the thresholds', () => {
    expect(RELATIVE_MINUTE_MS).toBe(MINUTE);
    expect(RELATIVE_DAY_LIMIT).toBe(30);
  });
});

describe('formatDateOnly', () => {
  it('renders YYYY-MM-DD with zero padding, in local time', () => {
    expect(formatDateOnly(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(formatDateOnly(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
});
