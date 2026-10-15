import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME_COLOR, EFFECT_COLORS, THEME_COLOR_PALETTE } from '../constants';
import { mapDraftSchema } from './mapDraft';
import { participantLinkagesSchema, participantTargetSchema, themeColorSchema } from './participant';

const baseDraft = {
  version: 1,
  gridSize: 6,
  cells: {
    '0,0': { object: { itemId: 12, w: 1, h: 1 } },
    '1,1': { background: { itemId: 5 } },
  },
  regions: [{ id: 'rg_a1b2c3', name: '森林区', cells: [[2, 2]] }],
  characterSlots: [
    { characterId: 5, themeColor: '#FFCC00', clue: '', linkages: [] },
    { characterId: 7, themeColor: '#FFFFFF', clue: '', linkages: [] },
    null,
    null,
    null,
    null,
  ],
};

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

describe('THEME_COLOR_PALETTE (MOD-801)', () => {
  it('keeps 15 swatches, all darkened, with the new deep mist blue', () => {
    expect(THEME_COLOR_PALETTE).toHaveLength(15);
    expect(THEME_COLOR_PALETTE[0]).toBe(DEFAULT_THEME_COLOR);
    expect(THEME_COLOR_PALETTE).toContain('#5B7C99');
    // The near-duplicate teal from v0.3.2 was dropped.
    expect(THEME_COLOR_PALETTE).not.toContain('#0F766E');
  });

  it('contains no bright / fluorescent colours (every entry is darkened)', () => {
    // Brightness proxy: no channel above 210 outside white/black.
    for (const hex of THEME_COLOR_PALETTE) {
      if (hex === '#FFFFFF' || hex === '#000000') continue;
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      expect(Math.max(r, g, b), hex).toBeLessThanOrEqual(210);
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
      participantTargetSchema.safeParse({ type: 'item', id: 12, scope: 'all', effect: 'highlight', color: 'blue' })
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
    // v0.3.8: the palette is extensible, so any well-formed lowercase key is
    // accepted here; "does this map define it?" is checked by mapDraftSchema.
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

  it('MOD-708: accepts item targets with scope instances + instance coords', () => {
    const result = participantTargetSchema.safeParse({
      type: 'item',
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
      { type: 'item', id: 12, scope: 'all', effect: 'highlight', color: 'blue' },
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

describe('mapDraftSchema participant references (CLAR-603 + MOD-801)', () => {
  it('accepts references that exist in the roster / map', () => {
    const draft = {
      ...baseDraft,
      characterSlots: [
        {
          characterId: 5,
          themeColor: '#FFCC00',
          clue: '他**喜欢**在黄昏。',
          linkages: [
            { type: 'character', id: 7, effect: 'highlight', color: 'red' },
            { type: 'item', id: 12, scope: 'all', effect: 'highlight', color: 'blue' },
            { type: 'region', id: 'rg_a1b2c3', effect: 'highlight', color: 'blue' },
            { type: 'cell', cells: [[3, 4]], effect: 'highlight', color: 'red' },
          ],
        },
        { characterId: 7, themeColor: '#FFFFFF', clue: '', linkages: [] },
        null,
        null,
        null,
        null,
      ],
    };
    const result = mapDraftSchema.safeParse(draft);
    expect(result.success).toBe(true);
  });

  it('rejects dangling character / item / region / cell references', () => {
    const failing = [
      { type: 'character', id: 999, effect: 'highlight', color: 'red' },
      { type: 'item', id: 999, scope: 'all', effect: 'highlight', color: 'red' },
      { type: 'region', id: 'nope', effect: 'highlight', color: 'blue' },
      { type: 'cell', cells: [[99, 0]], effect: 'highlight', color: 'red' },
    ];
    for (const target of failing) {
      const result = mapDraftSchema.safeParse({
        ...baseDraft,
        characterSlots: [
          { characterId: 5, themeColor: '#FFCC00', clue: '', linkages: [target] },
          { characterId: 7, themeColor: '#FFFFFF', clue: '', linkages: [] },
          null,
          null,
          null,
          null,
        ],
      });
      expect(result.success, JSON.stringify(target)).toBe(false);
    }
  });

  it('rejects drafts that still carry legacy placedCharacters', () => {
    const result = mapDraftSchema.safeParse({
      ...baseDraft,
      placedCharacters: [{ characterId: 5, x: 0, y: 1, themeColor: '#FFCC00', linkages: [] }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects drafts that still carry legacy triggers on slots', () => {
    const result = mapDraftSchema.safeParse({
      ...baseDraft,
      characterSlots: [
        {
          characterId: 5,
          themeColor: '#FFCC00',
          clue: '',
          triggers: [{ trigger: 'click', targets: [] }],
        },
        null,
        null,
        null,
        null,
        null,
      ],
    });
    expect(result.success).toBe(false);
  });

  it('MOD-702: accepts clue field on characterSlots', () => {
    const draft = {
      ...baseDraft,
      characterSlots: [
        { characterId: 5, themeColor: '#FFCC00', clue: '他**喜欢**在湖边。', linkages: [] },
        null, null, null, null, null,
      ],
    };
    const result = mapDraftSchema.safeParse(draft);
    expect(result.success).toBe(true);
  });

  it('MOD-801: accepts deep blue as theme colour (#1A3695)', () => {
    const draft = {
      ...baseDraft,
      characterSlots: [
        { characterId: 5, themeColor: '#1A3695', clue: '', linkages: [] },
        null, null, null, null, null,
      ],
    };
    const result = mapDraftSchema.safeParse(draft);
    expect(result.success).toBe(true);
  });
});

describe('CLAR-601: gender enum (only male / female)', () => {
  it('exposes only male / female via CHARACTER_GENDERS', async () => {
    const { CHARACTER_GENDERS, DEFAULT_CHARACTER_GENDER } = await import('../constants');
    expect(CHARACTER_GENDERS).toEqual(['male', 'female']);
    expect(DEFAULT_CHARACTER_GENDER).toBe('male');
  });
});
