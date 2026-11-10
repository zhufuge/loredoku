import { describe, expect, it } from 'vitest';
import { formatRelativeTime } from './GameCompletionMark';
import { formatElapsed } from '@/lib/gameTimer';

/**
 * v0.9.7：卡片上「最后离开谜题时间」改用相对时间，以及超过一小时的时间格式。
 *
 * 这两条都是**输出断言**（给一个输入，看渲染出的字符串），不是界面外观断言。
 */
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('formatRelativeTime（v0.9.7）', () => {
  const now = new Date('2026-11-10T15:00:00+08:00').getTime();
  const at = (msAgo: number): string => new Date(now - msAgo).toISOString();

  it('一分钟内说「刚刚」', () => {
    expect(formatRelativeTime(at(0), now)).toBe('刚刚');
    expect(formatRelativeTime(at(59_000), now)).toBe('刚刚');
  });

  it('一小时内说「N 分钟前」', () => {
    expect(formatRelativeTime(at(MINUTE), now)).toBe('1 分钟前');
    expect(formatRelativeTime(at(3 * MINUTE), now)).toBe('3 分钟前');
    expect(formatRelativeTime(at(59 * MINUTE), now)).toBe('59 分钟前');
  });

  it('一天内说「N 小时前」', () => {
    expect(formatRelativeTime(at(HOUR), now)).toBe('1 小时前');
    expect(formatRelativeTime(at(23 * HOUR), now)).toBe('23 小时前');
  });

  it('七天内说「N 天前」，再远就写具体日期', () => {
    expect(formatRelativeTime(at(DAY), now)).toBe('1 天前');
    expect(formatRelativeTime(at(7 * DAY), now)).toBe('7 天前');
    expect(formatRelativeTime(at(8 * DAY), now)).not.toContain('天前');
  });

  it('未来的时刻（时钟被拨过）按「刚刚」处理，不显示负数', () => {
    expect(formatRelativeTime(new Date(now + 5 * MINUTE).toISOString(), now)).toBe('刚刚');
  });

  it('坏数据不抛异常', () => {
    expect(formatRelativeTime('not-a-date', now)).toBe('—');
  });
});

describe('时间格式（v0.9.7）', () => {
  it('未超过一小时保持 mm:ss', () => {
    expect(formatElapsed(0)).toBe('00:00');
    expect(formatElapsed(187_000)).toBe('03:07');
    expect(formatElapsed(3_599_000)).toBe('59:59');
  });

  it('超过一小时用 hh:mm:ss（小时补两位）', () => {
    expect(formatElapsed(3_600_000)).toBe('01:00:00');
    expect(formatElapsed(3_787_000)).toBe('01:03:07');
    expect(formatElapsed(36_000_000)).toBe('10:00:00');
  });
});
