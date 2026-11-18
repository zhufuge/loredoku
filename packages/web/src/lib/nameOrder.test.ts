import { describe, expect, it } from 'vitest';
import { compareByName, sortByName } from './nameOrder';

/**
 * v0.11.4：资源 / 角色列表按名字排序，中文按拼音首字母。
 *
 * 断言的是**次序**（谁在谁前面），不是某个具体排序算法的实现 —— 换成拼音表或
 * 别的 collator 只要次序不变，这些用例仍然成立。
 */
describe('sortByName — 按名字排序（v0.11.4）', () => {
  it('中文按拼音首字母：B < D < J < L < P < Q < S < T < W < X < Y', () => {
    const names = [
      '鸳鸯',
      '袭人',
      '宝钗',
      '探春',
      '晴雯',
      '黛玉',
      '平儿',
      '贾宝玉',
      '王熙凤',
      '李纨',
      '麝月',
      '湘云',
    ];
    const sorted = sortByName(names.map((name) => ({ name }))).map((row) => row.name);
    expect(sorted).toEqual([
      '宝钗',
      '黛玉',
      '贾宝玉',
      '李纨',
      '平儿',
      '晴雯',
      '麝月',
      '探春',
      '王熙凤',
      '袭人',
      '湘云',
      '鸳鸯',
    ]);
  });

  it('同为首字母时继续比后面的音节（`在` zài 在 `字` zì 之前）', () => {
    expect(compareByName({ name: '在' }, { name: '字' })).toBeLessThan(0);
    expect(sortByName([{ name: '字' }, { name: '在' }]).map((row) => row.name)).toEqual([
      '在',
      '字',
    ]);
  });

  it('拉丁字母按字母序', () => {
    const sorted = sortByName(['Dave', 'alice', 'charlie', 'Bob'].map((name) => ({ name })));
    expect(sorted.map((row) => row.name)).toEqual(['alice', 'Bob', 'charlie', 'Dave']);
  });

  it('汉字排在拉丁字母之前（CLDR 的中文排序规则）', () => {
    expect(sortByName([{ name: 'apple' }, { name: '阿' }]).map((row) => row.name)).toEqual([
      '阿',
      'apple',
    ]);
  });

  it('同名时依次退回业务 ID、主键，顺序不依赖服务端的返回次序', () => {
    const rows = [
      { name: '船', code: 'b', id: 3 },
      { name: '船', code: 'a', id: 9 },
      { name: '船', code: 'a', id: 2 },
    ];
    expect(sortByName(rows).map((row) => row.id)).toEqual([2, 9, 3]);
  });

  it('不就地改调用方的数组（react-query 的缓存不该被排掉）', () => {
    const rows = [{ name: '鸳鸯' }, { name: '宝钗' }];
    const sorted = sortByName(rows);
    expect(rows.map((row) => row.name)).toEqual(['鸳鸯', '宝钗']);
    expect(sorted).not.toBe(rows);
  });

  it('空数组原样返回', () => {
    expect(sortByName([])).toEqual([]);
  });
});
