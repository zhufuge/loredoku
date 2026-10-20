import { describe, expect, it } from 'vitest';
import { estimateTextWidth, textEmUnits } from './textWidth';

describe('textEmUnits', () => {
  it('counts narrow glyphs as ~0.62em and wide ones as a full em', () => {
    expect(textEmUnits('')).toBe(0);
    expect(textEmUnits('7')).toBeCloseTo(0.62, 6);
    expect(textEmUnits('C24')).toBeCloseTo(3 * 0.62, 6);
    expect(textEmUnits('甲')).toBe(1);
    expect(textEmUnits('甲1')).toBeCloseTo(1.62, 6);
  });
});

describe('estimateTextWidth', () => {
  it('multiplies the unit count by the font size', () => {
    expect(estimateTextWidth('C24', 24)).toBeCloseTo(3 * 0.62 * 24, 6);
    expect(estimateTextWidth('C24', 48)).toBeCloseTo(3 * 0.62 * 48, 6);
  });

  it('returns 0 for a degenerate font size', () => {
    expect(estimateTextWidth('C24', 0)).toBe(0);
    expect(estimateTextWidth('C24', Number.NaN)).toBe(0);
    expect(estimateTextWidth('C24', -8)).toBe(0);
  });
});
