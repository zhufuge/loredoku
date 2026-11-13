import { describe, expect, it } from 'vitest';

import { MAX_CELL_SIZE } from '@loredoku/shared';

import {
  VERDICT_BASE_BOARD,
  VERDICT_BUTTON_BLOCK,
  VERDICT_CARD_FILL,
  VERDICT_CARD_MARK_HEIGHT,
  VERDICT_CARD_MARK_WIDTH,
  VERDICT_MARK_HEIGHT,
  VERDICT_MARK_WIDTH,
  VERDICT_MIN_SCALE,
  verdictCardScale,
  verdictMarkScale,
} from './verdictMark';

describe('verdictMarkScale（v0.10.0）', () => {
  it('参照尺寸取「两格顶到上限」', () => {
    expect(VERDICT_BASE_BOARD).toBe(MAX_CELL_SIZE * 2);
  });

  it('桌面棋盘（不小于参照）不缩', () => {
    expect(verdictMarkScale(VERDICT_BASE_BOARD)).toBe(1);
    expect(verdictMarkScale(VERDICT_BASE_BOARD * 2)).toBe(1);
  });

  it('手机上的小棋盘按边长等比缩', () => {
    // 2×2 棋盘塞进 375 宽的中列：每格约 118，整块约 236。
    expect(verdictMarkScale(240)).toBeCloseTo(0.5, 5);
    expect(verdictMarkScale(360)).toBeCloseTo(0.75, 5);
  });

  it('缩到下限就停住，不会缩没', () => {
    expect(verdictMarkScale(120)).toBe(VERDICT_MIN_SCALE);
    expect(verdictMarkScale(1)).toBe(VERDICT_MIN_SCALE);
  });

  it('还没量出尺寸时按原样（不闪一下小的）', () => {
    expect(verdictMarkScale(0)).toBe(1);
    expect(verdictMarkScale(Number.NaN)).toBe(1);
  });
});

describe('verdictMarkScale 按可见区再收一道（v0.10.2）', () => {
  it('屏上剩的地方比棋盘算出来的更小，就按可见区缩', () => {
    // 横屏手机：棋盘按作者配的格子有 924 见方（棋盘口径是「不用缩」），
    // 但中列只剩 740×106 —— 高度上连按比例摆都摆不下。
    const scale = verdictMarkScale(924, { width: 740, height: 106 });
    expect(scale).toBe(VERDICT_MIN_SCALE);
  });

  it('可见区算出来比棋盘口径大时，取小的那个', () => {
    // 棋盘口径 0.5（240 / 480），可见区口径约 0.87 —— 结果是 0.5。
    const scale = verdictMarkScale(240, { width: 320, height: 343 });
    expect(scale).toBeCloseTo(0.5, 5);
  });

  it('可见区够大就还是 1，不会因为这条规则被放大', () => {
    expect(verdictMarkScale(VERDICT_BASE_BOARD, { width: 1280, height: 800 })).toBe(1);
    expect(verdictMarkScale(VERDICT_BASE_BOARD, { width: 4000, height: 4000 })).toBe(1);
  });

  it('可见区按「宽 / 整块宽」与「高减按钮 / 整块高」取小', () => {
    // 宽够、高不够：高度那一支是 (320 - 64) / 320 = 0.8。
    const narrowHeight = verdictMarkScale(VERDICT_BASE_BOARD, {
      width: VERDICT_MARK_WIDTH * 4,
      height: VERDICT_MARK_HEIGHT + VERDICT_BUTTON_BLOCK,
    });
    expect(narrowHeight).toBeCloseTo(1, 5);

    // 高度刚好只够放整块、没有按钮的余量：被下限兜住，但确实比 1 小。
    expect(
      verdictMarkScale(VERDICT_BASE_BOARD, { width: 4000, height: VERDICT_MARK_HEIGHT }),
    ).toBeLessThan(1);
  });

  it('还没量出可见区时只按棋盘算（不闪一下小的）', () => {
    expect(verdictMarkScale(VERDICT_BASE_BOARD, null)).toBe(1);
    expect(verdictMarkScale(VERDICT_BASE_BOARD, { width: 0, height: 0 })).toBe(1);
    expect(verdictMarkScale(VERDICT_BASE_BOARD, { width: 900, height: 0 })).toBe(1);
  });
});

describe('verdictCardScale 卡片上的「定案」按封面缩（v0.10.2）', () => {
  it('四列网格里 136 见方的封面：按高度那支缩到差不多一半', () => {
    // 整块原样 168×192，136×0.78 = 106.08；106.08 / 192 ≈ 0.5525 是按高算的，
    // 106.08 / 168 ≈ 0.6314 是按宽算的 —— 取小的那支。
    const scale = verdictCardScale({ width: 136, height: 136 });
    expect(scale).toBeCloseTo((136 * VERDICT_CARD_FILL) / VERDICT_CARD_MARK_HEIGHT, 5);
    expect(scale).toBeLessThan(1);
    expect(scale).toBeGreaterThanOrEqual(VERDICT_MIN_SCALE);
  });

  it('封面大到装得下整块就不缩，也不放大', () => {
    const roomy = Math.max(VERDICT_CARD_MARK_WIDTH, VERDICT_CARD_MARK_HEIGHT) / VERDICT_CARD_FILL;
    expect(verdictCardScale({ width: roomy, height: roomy })).toBe(1);
    expect(verdictCardScale({ width: 4000, height: 4000 })).toBe(1);
  });

  it('宽高不等时按窄的那一边算 —— 扁封面不会被字顶出去', () => {
    const wide = verdictCardScale({ width: 400, height: 136 });
    expect(wide).toBeCloseTo((136 * VERDICT_CARD_FILL) / VERDICT_CARD_MARK_HEIGHT, 5);
  });

  it('封面很小时停在下限，不会缩没', () => {
    expect(verdictCardScale({ width: 40, height: 40 })).toBe(VERDICT_MIN_SCALE);
    expect(verdictCardScale({ width: 1, height: 1 })).toBe(VERDICT_MIN_SCALE);
  });

  it('还没量出封面尺寸时按原样（不闪一下小的）', () => {
    expect(verdictCardScale(null)).toBe(1);
    expect(verdictCardScale(undefined)).toBe(1);
    expect(verdictCardScale({ width: 0, height: 0 })).toBe(1);
  });
});
