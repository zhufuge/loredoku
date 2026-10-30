import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME_COLOR, EFFECT_COLORS } from '../constants';
import { characterSlotEntrySchema } from './mapDraft';
import { participantLinkagesSchema, participantTargetSchema, themeColorSchema } from './participant';

const slot = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  characterId: 5,
  themeColor: '#FFCC00',
  clue: '',
  linkages: [],
  ...extra,
});

describe('themeColorSchema', () => {
  it('defaults to white and accepts #RRGGBB', () => {
    expect(themeColorSchema.parse(undefined)).toBe(DEFAULT_THEME_COLOR);
    expect(themeColorSchema.parse('#FFCC00')).toBe('#FFCC00');
  });

  it('rejects non-hex and short hex values', () => {
    expect(themeColorSchema.safeParse('#fff').success).toBe(false);
    expect(themeColorSchema.safeParse('red').success).toBe(false);
  });

  it('MOD-710: accepts blue hues (no longer restricted)', () => {
    for (const blue of ['#3B82F6', '#0EA5E9', '#2563EB', '#1E40AF', '#5B7C99']) {
      expect(themeColorSchema.safeParse(blue).success, blue).toBe(true);
    }
  });

  it('accepts colours outside the former reserved hue window', () => {
    for (const color of ['#FFFFFF', '#000000', '#EF4444', '#22C55E', '#FACC15']) {
      expect(themeColorSchema.safeParse(color).success).toBe(true);
    }
  });
});

describe('participantTargetSchema', () => {
  it('accepts the four documented target types', () => {
    expect(
      participantTargetSchema.safeParse({ type: 'character', id: 7, effect: 'highlight', color: 'red' })
        .success,
    ).toBe(true);
    expect(
      participantTargetSchema.safeParse({ type: 'asset', id: 12, scope: 'all', effect: 'highlight', color: 'blue' })
        .success,
    ).toBe(true);
    expect(
      participantTargetSchema.safeParse({ type: 'cell', cells: [[3, 4]], effect: 'highlight', color: 'red' })
        .success,
    ).toBe(true);
    expect(
      participantTargetSchema.safeParse({
        type: 'region',
        id: 'rg_a1b2c3',
        effect: 'highlight',
        color: 'blue',
      }).success,
    ).toBe(true);
  });

  it('accepts palette keys (FEAT-D04) and restricts effects to known types', () => {
    for (const color of EFFECT_COLORS) {
      expect(
        participantTargetSchema.safeParse({ type: 'cell', cells: [[0, 0]], effect: 'highlight', color })
          .success,
      ).toBe(true);
    }
    // the palette is extensible, so any well-formed lowercase key is
    // accepted here; "does this puzzle define it?" is checked by
    // puzzleDraftSchema.
    expect(
      participantTargetSchema.safeParse({ type: 'cell', cells: [[0, 0]], effect: 'highlight', color: 'green' })
        .success,
    ).toBe(true);
    expect(
      participantTargetSchema.safeParse({ type: 'cell', cells: [[0, 0]], effect: 'highlight', color: 'Green' })
        .success,
    ).toBe(false);
    expect(
      participantTargetSchema.safeParse({ type: 'cell', cells: [[0, 0]], effect: 'explode', color: 'red' })
        .success,
    ).toBe(false);
  });

  it('MOD-708: accepts asset targets with scope instances + instance coords', () => {
    const result = participantTargetSchema.safeParse({
      type: 'asset',
      id: 12,
      scope: 'instances',
      instances: [[1, 2], [3, 4]],
      effect: 'highlight',
      color: 'red',
    });
    expect(result.success).toBe(true);
  });

  it('MOD-708: accepts cell targets with multiple coords', () => {
    const result = participantTargetSchema.safeParse({
      type: 'cell',
      cells: [[1, 2], [3, 4], [5, 6]],
      effect: 'highlight',
      color: 'blue',
    });
    expect(result.success).toBe(true);
  });

  it('MOD-708: rejects cell targets with empty cells array', () => {
    const result = participantTargetSchema.safeParse({
      type: 'cell',
      cells: [],
      effect: 'highlight',
      color: 'red',
    });
    expect(result.success).toBe(false);
  });
});

describe('participantLinkagesSchema (MOD-801)', () => {
  it('defaults to an empty array', () => {
    expect(participantLinkagesSchema.parse(undefined)).toEqual([]);
  });

  it('accepts a flat mixed list (no click/touch grouping)', () => {
    const result = participantLinkagesSchema.safeParse([
      { type: 'character', id: 7, effect: 'highlight', color: 'red' },
      { type: 'asset', id: 12, scope: 'all', effect: 'highlight', color: 'blue' },
      { type: 'cell', cells: [[2, 2], [3, 2]], effect: 'highlight', color: 'red' },
      { type: 'region', id: 'rg_a1b2c3', effect: 'highlight', color: 'blue' },
    ]);
    expect(result.success).toBe(true);
  });

  it('rejects legacy trigger-grouped payloads', () => {
    const result = participantLinkagesSchema.safeParse([
      { trigger: 'click', targets: [{ type: 'character', id: 7, effect: 'highlight', color: 'red' }] },
    ]);
    expect(result.success).toBe(false);
  });
});

describe('characterSlotEntrySchema (v0.5.0: the roster lives on the puzzle)', () => {
  it('MOD-702: accepts a clue and defaults an absent linkages list', () => {
    const result = characterSlotEntrySchema.safeParse({
      characterId: 5,
      themeColor: '#FFCC00',
      clue: '他**喜欢**在湖边。',
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.linkages).toEqual([]);
  });

  it('rejects slots that still carry legacy triggers', () => {
    expect(
      characterSlotEntrySchema.safeParse(
        slot({ triggers: [{ trigger: 'click', targets: [] }] }),
      ).success,
    ).toBe(false);
  });

  it('MOD-801: accepts deep blue as theme colour (#1A3695)', () => {
    expect(characterSlotEntrySchema.safeParse(slot({ themeColor: '#1A3695' })).success).toBe(true);
  });
});

describe('FEAT-E01: positionConditions on a roster slot', () => {
  it('parses the optional OR-ed list of cells', () => {
    const result = characterSlotEntrySchema.safeParse(
      slot({
        positionConditions: [
          { x: 1, y: 2 },
          { x: 3, y: 0 },
        ],
      }),
    );
    expect(result.success).toBe(true);
    expect(result.success && result.data.positionConditions).toEqual([
      { x: 1, y: 2 },
      { x: 3, y: 0 },
    ]);
  });

  it('keeps an old slot without the field valid (absent means "no constraint")', () => {
    const result = characterSlotEntrySchema.safeParse(slot());
    expect(result.success).toBe(true);
    expect(result.success && result.data.positionConditions).toBeUndefined();
  });

  it('accepts an explicit empty list', () => {
    const result = characterSlotEntrySchema.safeParse(slot({ positionConditions: [] }));
    expect(result.success).toBe(true);
  });

  it('rejects a negative or non-integer coordinate', () => {
    expect(
      characterSlotEntrySchema.safeParse(slot({ positionConditions: [{ x: -1, y: 0 }] })).success,
    ).toBe(false);
    expect(
      characterSlotEntrySchema.safeParse(slot({ positionConditions: [{ x: 1.5, y: 0 }] })).success,
    ).toBe(false);
  });
});

describe('CLAR-601: gender enum (only male / female)', () => {
  it('exposes only male / female via CHARACTER_GENDERS', async () => {
    const { CHARACTER_GENDERS, DEFAULT_CHARACTER_GENDER } = await import('../constants');
    expect(CHARACTER_GENDERS).toEqual(['male', 'female']);
    expect(DEFAULT_CHARACTER_GENDER).toBe('male');
  });
});
