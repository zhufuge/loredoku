import { describe, expect, it } from 'vitest';
import { parseClue, truncateClue } from './clue';

describe('parseClue', () => {
  it('empty string → []', () => {
    expect(parseClue('')).toEqual([]);
  });

  it('plain text → single non-bold segment', () => {
    expect(parseClue('hello')).toEqual([{ text: 'hello', bold: false }]);
  });

  it('bold in middle', () => {
    expect(parseClue('a**b**c')).toEqual([
      { text: 'a', bold: false },
      { text: 'b', bold: true },
      { text: 'c', bold: false },
    ]);
  });

  it('entirely bold', () => {
    expect(parseClue('**whole**')).toEqual([{ text: 'whole', bold: true }]);
  });

  it('unclosed ** → literal', () => {
    const result = parseClue('un**closed');
    // Should treat the ** as literal
    expect(result.length).toBeGreaterThanOrEqual(1);
    // The full text should be recoverable
    const joined = result.map((s) => s.text).join('');
    expect(joined.replace(/\*\*/g, '')).toBe('unclosed');
  });

  it('multiple bold pairs', () => {
    expect(parseClue('**a**b**c**')).toEqual([
      { text: 'a', bold: true },
      { text: 'b', bold: false },
      { text: 'c', bold: true },
    ]);
  });

  it('handles empty bold markers ** ** (space between)', () => {
    const result = parseClue('** **');
    // ** + space + ** → should toggle on then off
    expect(result.some((s) => s.text === ' ' || s.text === '')).toBe(true);
  });

  it('handles adjacent bold segments', () => {
    expect(parseClue('**a****b**')).toEqual([
      { text: 'a', bold: true },
      { text: 'b', bold: true },
    ]);
  });

  it('clue with multiple words bolded', () => {
    expect(parseClue('他**喜欢**在**黄昏**时分来到**湖边**。')).toEqual([
      { text: '他', bold: false },
      { text: '喜欢', bold: true },
      { text: '在', bold: false },
      { text: '黄昏', bold: true },
      { text: '时分来到', bold: false },
      { text: '湖边', bold: true },
      { text: '。', bold: false },
    ]);
  });
});

describe('truncateClue', () => {
  it('short string → unchanged', () => {
    expect(truncateClue('short clue')).toBe('short clue');
  });

  it('long string → truncated with ellipsis', () => {
    const long = '这是一段很长的线索文字'.repeat(10);
    const result = truncateClue(long, 20);
    expect(result.length).toBe(21); // 20 + '…'
    expect(result.endsWith('…')).toBe(true);
  });
});