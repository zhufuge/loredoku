import { describe, expect, it } from 'vitest';
import {
  GAME_DIFFICULTY_DEFAULT,
  GAME_DIFFICULTY_LEVELS,
  GAME_NAME_MAX_LENGTH,
  GAME_SLUG_MAX_LENGTH,
  MAP_LAYER_ORDER,
  MAP_LAYER_Z,
} from '../constants';
import { cellPlacementSchema, gameDeploySchema, gameSlugParamSchema } from './game';

describe('MAP_LAYER_ORDER / MAP_LAYER_Z (SPEC-G01 / SPEC-G02)', () => {
  it('lists fifteen layers, the two game-only ones between 区域标签 and 物品图层', () => {
    expect(MAP_LAYER_ORDER).toEqual([
      'mouseCursorBox',
      'operationCursorBox',
      'regionLabel',
      'gameToolHint',
      'gamePlacement',
      'itemLayer',
      'regionOutline',
      'canvasFrame',
      'gridSeparator',
      'blockingMask',
      'regionHighlight',
      'cellHighlight',
      'backgroundHighlight',
      'backgroundLayer',
      'canvasBase',
    ]);
  });

  it('assigns a strictly descending z-index with no duplicates', () => {
    const values = MAP_LAYER_ORDER.map((name) => MAP_LAYER_Z[name]);
    for (let index = 1; index < values.length; index += 1) {
      expect(values[index - 1]!).toBeGreaterThan(values[index]!);
    }
    expect(new Set(values).size).toBe(values.length);
  });

  it('keeps the mouse box the top-most element', () => {
    expect(MAP_LAYER_Z.mouseCursorBox).toBe(Math.max(...Object.values(MAP_LAYER_Z)));
  });

  it('registers the two game layers between 区域标签 and 物品图层', () => {
    expect(MAP_LAYER_Z.regionLabel).toBeGreaterThan(MAP_LAYER_Z.gameToolHint);
    expect(MAP_LAYER_Z.gameToolHint).toBeGreaterThan(MAP_LAYER_Z.gamePlacement);
    expect(MAP_LAYER_Z.gamePlacement).toBeGreaterThan(MAP_LAYER_Z.itemLayer);
  });
});

describe('gameDeploySchema (FEAT-G02 §5.2, CONS-K16 起按谜题部署)', () => {
  it('accepts a full deploy body', () => {
    const parsed = gameDeploySchema.parse({
      name: '  神秘古堡  ',
      difficulty: 'expert',
      clearCover: false,
    });
    expect(parsed.name).toBe('神秘古堡');
    expect(parsed.difficulty).toBe('expert');
    expect(parsed.clearCover).toBe(false);
  });

  it('defaults the difficulty to medium and leaves the name to the service', () => {
    const parsed = gameDeploySchema.parse({});
    expect(parsed.difficulty).toBe(GAME_DIFFICULTY_DEFAULT);
    expect(parsed.name).toBeUndefined();
  });

  it('no longer takes a version number — the puzzle pins it (v0.5.0)', () => {
    expect('versionNo' in gameDeploySchema.parse({})).toBe(false);
    expect(gameDeploySchema.safeParse({ versionNo: 3 }).success).toBe(true);
  });

  it('rejects an unknown difficulty', () => {
    expect(gameDeploySchema.safeParse({ difficulty: 'nightmare' }).success).toBe(false);
  });

  it('rejects an over-long name', () => {
    expect(
      gameDeploySchema.safeParse({ name: 'x'.repeat(GAME_NAME_MAX_LENGTH + 1) }).success,
    ).toBe(false);
  });

  it('accepts every difficulty tier the UI offers', () => {
    for (const difficulty of GAME_DIFFICULTY_LEVELS) {
      expect(gameDeploySchema.parse({ difficulty }).difficulty).toBe(difficulty);
    }
  });
});

describe('gameDeploySchema slug & clearCover (OPT-W04 / OPT-W03)', () => {
  it('trims an author-supplied slug', () => {
    const parsed = gameDeploySchema.parse({ slug: '  puzzle-castle-hard  ' });
    expect(parsed.slug).toBe('puzzle-castle-hard');
  });

  it('leaves the slug undefined so the service can derive the default', () => {
    expect(gameDeploySchema.parse({}).slug).toBeUndefined();
    expect(gameDeploySchema.parse({ clearCover: false }).clearCover).toBe(false);
  });

  it('rejects an over-long slug but still accepts an empty one for the service to judge', () => {
    expect(
      gameDeploySchema.safeParse({ slug: 'x'.repeat(GAME_SLUG_MAX_LENGTH + 1) }).success,
    ).toBe(false);
    expect(gameDeploySchema.parse({ slug: '' }).slug).toBe('');
  });

  it('flag the "remove the stored cover" request separately from the cover bytes', () => {
    const parsed = gameDeploySchema.parse({ clearCover: true });
    expect(parsed.clearCover).toBe(true);
    // v0.7.1 §7.2: the mime / size / dimension fields are gone with the columns.
    expect(parsed).not.toHaveProperty('coverPath');
  });
});

describe('gameSlugParamSchema (OPT-W04 §4.6)', () => {
  it('accepts a well-formed path segment', () => {
    expect(gameSlugParamSchema.parse({ slug: '  puzzle-flower-garden-very-easy  ' }).slug).toBe(
      'puzzle-flower-garden-very-easy',
    );
  });

  it('rejects uppercase, spaces and over-long segments before they reach the database', () => {
    expect(gameSlugParamSchema.safeParse({ slug: 'Puzzle' }).success).toBe(false);
    expect(gameSlugParamSchema.safeParse({ slug: 'puzzle flower' }).success).toBe(false);
    expect(gameSlugParamSchema.safeParse({ slug: 'x'.repeat(GAME_SLUG_MAX_LENGTH + 1) }).success).toBe(
      false,
    );
  });
});

describe('cellPlacementSchema (SPEC-G01 §7.1)', () => {
  it('accepts the three mutually exclusive forms', () => {
    expect(cellPlacementSchema.parse({ kind: 'participant', index: 2 })).toEqual({
      kind: 'participant',
      index: 2,
    });
    expect(cellPlacementSchema.parse({ kind: 'numbers', entries: [1, 3] })).toEqual({
      kind: 'numbers',
      entries: [1, 3],
    });
    expect(cellPlacementSchema.parse({ kind: 'forbidden' })).toEqual({ kind: 'forbidden' });
  });

  it('rejects a zero / negative participant index', () => {
    expect(cellPlacementSchema.safeParse({ kind: 'participant', index: 0 }).success).toBe(false);
    expect(cellPlacementSchema.safeParse({ kind: 'numbers', entries: [0] }).success).toBe(false);
  });

  it('rejects an unknown kind', () => {
    expect(cellPlacementSchema.safeParse({ kind: 'sticker' }).success).toBe(false);
  });
});
