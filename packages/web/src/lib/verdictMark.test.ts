import { describe, expect, it } from 'vitest';

import { MAX_CELL_SIZE } from '@loredoku/shared';

import { VERDICT_BASE_BOARD, VERDICT_MIN_SCALE, verdictMarkScale } from './verdictMark';

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
