import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ITEM_OFFSET,
  DEFAULT_ITEM_SCALE,
  ITEM_OFFSET_MAX,
  ITEM_OFFSET_MIN,
  ITEM_SCALE_MAX,
  ITEM_SCALE_MIN,
  isIdentityItemTransform,
  resolveItemTransform,
} from '../constants';
import { draftAnchorItemSchema, mapDraftSchema } from './mapDraft';

/**
 * v0.7.5 (docs/v0.7.5.md §3): 物品的展示变换（等比例缩放 + 按格偏移）。
 *
 * 三个字段都是**可选**的：老草稿没有它们，语义就是恒等。`draftCellSchema`
 * 是 `.strict()`，所以 schema 必须显式声明，否则新写的草稿会被自己拒掉。
 */
const anchor = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  assetId: 5,
  w: 1,
  h: 1,
  ...extra,
});

function draft(cells: Record<string, unknown>): Record<string, unknown> {
  return { version: 7, gridSize: 4, cells, regions: [] };
}

describe('draftAnchorItemSchema — 展示变换（v0.7.5）', () => {
  it('keeps an anchor without a transform valid (old drafts)', () => {
    const parsed = draftAnchorItemSchema.parse(anchor());
    expect(parsed).toEqual({ assetId: 5, w: 1, h: 1 });
    expect(resolveItemTransform(parsed)).toEqual({
      scale: 1,
      offsetX: 0,
      offsetY: 0,
    });
  });

  it('accepts the whole range, negative offsets included', () => {
    for (const scale of [ITEM_SCALE_MIN, 0.75, 1, 2.5, ITEM_SCALE_MAX]) {
      expect(draftAnchorItemSchema.safeParse(anchor({ scale })).success, String(scale)).toBe(true);
    }
    for (const offset of [ITEM_OFFSET_MIN, -1.25, 0, 3.5, ITEM_OFFSET_MAX]) {
      expect(
        draftAnchorItemSchema.safeParse(anchor({ offsetX: offset, offsetY: offset })).success,
        String(offset),
      ).toBe(true);
    }
  });

  it('rejects values outside the range instead of clamping them on read', () => {
    expect(draftAnchorItemSchema.safeParse(anchor({ scale: ITEM_SCALE_MIN - 0.01 })).success).toBe(
      false,
    );
    expect(draftAnchorItemSchema.safeParse(anchor({ scale: ITEM_SCALE_MAX + 0.01 })).success).toBe(
      false,
    );
    expect(draftAnchorItemSchema.safeParse(anchor({ offsetX: ITEM_OFFSET_MIN - 0.01 })).success).toBe(
      false,
    );
    expect(draftAnchorItemSchema.safeParse(anchor({ offsetY: ITEM_OFFSET_MAX + 0.01 })).success).toBe(
      false,
    );
  });

  it('rejects a string masquerading as a number', () => {
    expect(draftAnchorItemSchema.safeParse(anchor({ scale: '1.5' })).success).toBe(false);
  });

  it('survives a full draft round-trip (the cell schema is strict)', () => {
    const result = mapDraftSchema.safeParse(
      draft({
        '1,1': { item: anchor({ scale: 1.5, offsetX: -0.5, offsetY: 0.25 }) },
      }),
    );
    expect(result.success).toBe(true);
  });
});

describe('resolveItemTransform（v0.7.5）', () => {
  it('defaults every missing field', () => {
    expect(resolveItemTransform(undefined)).toEqual({
      scale: DEFAULT_ITEM_SCALE,
      offsetX: DEFAULT_ITEM_OFFSET,
      offsetY: DEFAULT_ITEM_OFFSET,
    });
    expect(resolveItemTransform({ scale: 2 })).toEqual({ scale: 2, offsetX: 0, offsetY: 0 });
  });

  it('clamps a hand-edited payload', () => {
    expect(resolveItemTransform({ scale: 99, offsetX: -99, offsetY: 99 })).toEqual({
      scale: ITEM_SCALE_MAX,
      offsetX: ITEM_OFFSET_MIN,
      offsetY: ITEM_OFFSET_MAX,
    });
  });

  it('rounds to two decimals so the draft stays readable', () => {
    expect(resolveItemTransform({ offsetX: 0.3333 }).offsetX).toBe(0.33);
    expect(resolveItemTransform({ scale: 1.234 }).scale).toBe(1.23);
  });

  it('falls back to the default for NaN / Infinity', () => {
    expect(
      resolveItemTransform({ scale: Number.NaN, offsetX: Infinity, offsetY: -Infinity }),
    ).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
  });

  it('knows the identity transform', () => {
    expect(isIdentityItemTransform({ scale: 1, offsetX: 0, offsetY: 0 })).toBe(true);
    expect(isIdentityItemTransform({ scale: 1.01, offsetX: 0, offsetY: 0 })).toBe(false);
    expect(isIdentityItemTransform({ scale: 1, offsetX: 0, offsetY: 0.05 })).toBe(false);
  });
});
