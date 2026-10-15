import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME_COLOR, EFFECT_COLORS } from '../constants';
import { mapDraftSchema } from './mapDraft';
import { participantTargetSchema, themeColorSchema } from './participant';

const baseDraft = {
  version: 1,
  gridSize: 6,
  cells: {
    '0,0': { object: { itemId: 12, w: 1, h: 1 } },
    '1,1': { background: { itemId: 5 } },
  },
  regions: [{ id: 'rg_a1b2c3', name: '森林区', cells: [[2, 2]] }],
  characterSlots: [
    { characterId: 5, themeColor: '#FFCC00', clue: '', triggers: [] },
    { characterId: 7, themeColor: '#FFFFFF', clue: '', triggers: [] },
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
    for (const blue of ['#3B82F6', '#0EA5E9', '#2563EB', '#1E40AF', '#0F766E']) {
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

  it('restricts colours to red / blue and effects to known types', () => {
    for (const color of EFFECT_COLORS) {
      expect(
        participantTargetSchema.safeParse({ type: 'cell', cells: [[0, 0]], effect: 'highlight', color })
          .success,
      ).toBe(true);
    }
    expect(
      participantTargetSchema.safeParse({ type: 'cell', cells: [[0, 0]], effect: 'highlight', color: 'green' })
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

describe('mapDraftSchema participant references (CLAR-603 + MOD-708)', () => {
  it('accepts references that exist in the roster / map', () => {
    const draft = {
      ...baseDraft,
      characterSlots: [
        {
          characterId: 5,
          themeColor: '#FFCC00',
          clue: '他**喜欢**在黄昏。',
          triggers: [
            {
              trigger: 'click',
              targets: [
                { type: 'character', id: 7, effect: 'highlight', color: 'red' },
                { type: 'item', id: 12, scope: 'all', effect: 'highlight', color: 'blue' },
                { type: 'region', id: 'rg_a1b2c3', effect: 'highlight', color: 'blue' },
                { type: 'cell', cells: [[3, 4]], effect: 'highlight', color: 'red' },
              ],
            },
          ],
        },
        { characterId: 7, themeColor: '#FFFFFF', clue: '', triggers: [] },
        null,
        null,
        null,
        null,
      ],
    };
    const result = mapDraftSchema.safeParse(draft);
    expect(result.success).toBe(true);
  });

  it('rejects dangling character / item / region references', () => {
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
          {
            characterId: 5,
            themeColor: '#FFCC00',
            clue: '',
            triggers: [{ trigger: 'click', targets: [target] }],
          },
          { characterId: 7, themeColor: '#FFFFFF', clue: '', triggers: [] },
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
      placedCharacters: [{ characterId: 5, x: 0, y: 1, themeColor: '#FFCC00', triggers: [] }],
    });
    expect(result.success).toBe(false);
  });

  it('MOD-702: accepts clue field on characterSlots', () => {
    const draft = {
      ...baseDraft,
      characterSlots: [
        { characterId: 5, themeColor: '#FFCC00', clue: '他**喜欢**在湖边。', triggers: [] },
        null, null, null, null, null,
      ],
    };
    const result = mapDraftSchema.safeParse(draft);
    expect(result.success).toBe(true);
  });

  it('MOD-710: accepts deep blue as theme colour (#1E40AF)', () => {
    const draft = {
      ...baseDraft,
      characterSlots: [
        { characterId: 5, themeColor: '#1E40AF', clue: '', triggers: [] },
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