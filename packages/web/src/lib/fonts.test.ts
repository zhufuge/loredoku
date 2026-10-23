import { describe, expect, it } from 'vitest';
import {
  bundledFontFamilies,
  fontFamilyLabel,
  fontFamilyOptions,
  parseFontFileName,
} from './fonts';

/**
 * v0.7.4 (docs/v0.7.4.md §2): 字体选择器列的是**具体字体**，清单来自
 * `src/assets/fonts/` 目录。目录是构建期扫的，所以这里测两件与目录内容无关的事：
 * 文件名怎么读成一个字族，以及选项列表在「本构建没有这款字体」时怎么收场。
 */
describe('parseFontFileName', () => {
  it('reads a family with an explicit weight', () => {
    expect(parseFontFileName('WenKai-Bold.woff2')).toEqual({
      family: 'WenKai',
      weight: 700,
      style: 'normal',
    });
  });

  it('keeps hyphens that belong to the family name', () => {
    expect(parseFontFileName('Noto-Serif-SC-Regular.ttf')).toEqual({
      family: 'Noto Serif SC',
      weight: 400,
      style: 'normal',
    });
  });

  it('accepts a bare family name and a CJK one', () => {
    expect(parseFontFileName('WenKai.woff2')?.weight).toBe(400);
    expect(parseFontFileName('霞鹜文楷.woff2')).toMatchObject({
      family: '霞鹜文楷',
      weight: 400,
    });
  });

  it('understands a hyphenated weight token', () => {
    expect(parseFontFileName('WenKai-Semi-Bold.woff2')).toMatchObject({
      family: 'WenKai',
      weight: 600,
    });
  });

  it('understands a numeric weight and an italic suffix', () => {
    expect(parseFontFileName('WenKai-700.woff2')).toMatchObject({ weight: 700 });
    expect(parseFontFileName('WenKai-Bold-Italic.woff2')).toMatchObject({
      family: 'WenKai',
      weight: 700,
      style: 'italic',
    });
  });

  it('leaves an unrecognised suffix in the family name', () => {
    // 认不出的词只能当字族的一部分 —— 猜成字重会把两款不同字体合成一款。
    expect(parseFontFileName('WenKai-Display.woff2')).toMatchObject({
      family: 'WenKai Display',
      weight: 400,
    });
  });

  it('rejects a file name with no family part', () => {
    expect(parseFontFileName('.woff2')).toBeNull();
    expect(parseFontFileName('   ')).toBeNull();
  });
});

describe('fontFamilyOptions', () => {
  it('always starts with 系统默认', () => {
    const options = fontFamilyOptions();
    expect(options[0]).toEqual({ value: 'system', label: '系统默认', source: 'builtin' });
  });

  it('lists the fonts found in assets/fonts/', () => {
    const families = bundledFontFamilies();
    const options = fontFamilyOptions().map((option) => option.value);
    expect(options.slice(1)).toEqual(families);
  });

  it('does not duplicate the current value when it is already listed', () => {
    const options = fontFamilyOptions('system');
    expect(options.filter((option) => option.value === 'system')).toHaveLength(1);
  });

  it('appends a draft font this build does not ship, marked as the current one', () => {
    const options = fontFamilyOptions('Nonexistent Font');
    const current = options.find((option) => option.value === 'Nonexistent Font');
    expect(current).toEqual({
      value: 'Nonexistent Font',
      label: 'Nonexistent Font（当前）',
      source: 'legacy',
    });
  });

  it('labels a built-in key in Chinese and a font name as itself', () => {
    expect(fontFamilyLabel('serif')).toBe('衬线');
    expect(fontFamilyLabel('WenKai')).toBe('WenKai');
  });
});
