import { describe, expect, it } from 'vitest';
import {
  GAME_DIFFICULTY_DEFAULT,
  GAME_DIFFICULTY_LEVELS,
  GAME_NAME_MAX_LENGTH,
  GAME_SLUG_MAX_LENGTH,
  MAP_LAYER_ORDER,
  MAP_LAYER_Z,
} from '../constants';
import { cellPlacementSchema, gameDeploySchema, gameSlugParamSchema, mapGameSnapshotSchema } from './game';

describe('MAP_LAYER_ORDER / MAP_LAYER_Z (SPEC-G01 / SPEC-G02)', () => {
  it('lists fifteen layers, the two game-only ones between 区域标签 and 物品图层', () => {
    expect(MAP_LAYER_ORDER).toEqual([
      'mouseCursorBox',
      'operationCursorBox',
      'regionLabel',
      'gameToolHint',
      'gamePlacement',
      'itemLayer',
      'canvasFrame',
      'gridSeparator',
      'regionOutline',
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
      coverPath: 'games/1/a.png',
      coverMime: 'image/png',
      coverSize: 1234,
      coverWidth: 960,
      coverHeight: 540,
    });
    expect(parsed.name).toBe('神秘古堡');
    expect(parsed.difficulty).toBe('expert');
    expect(parsed.coverPath).toBe('games/1/a.png');
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
    expect(parsed.coverPath).toBeUndefined();
  });
});

describe('mapGameSnapshotSchema (CONS-K16 §10.1)', () => {
  const map = { version: 3, gridSize: 6, cells: {}, regions: [] };
  const puzzle = {
    version: 1,
    map: { mapId: 217, versionNo: 3, gridSize: 6 },
    name: '午夜花园',
    description: '',
    linkageColors: [
      { key: 'red', label: '红', color: '#E5484D' },
      { key: 'blue', label: '蓝', color: '#3E63DD' },
    ],
    characterSlots: [{ characterId: 12, themeColor: '#FFFFFF', clue: '', linkages: [] }],
  };

  it('新快照：画布 + 谜题', () => {
    const result = mapGameSnapshotSchema.safeParse({ map, puzzle });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.puzzle?.name).toBe('午夜花园');
    expect(result.data.legacyCharacterSlots).toBeUndefined();
  });

  it('老快照：画布 + legacy 参与者 / 调色板，puzzle 为 null', () => {
    const result = mapGameSnapshotSchema.safeParse({
      map,
      puzzle: null,
      legacyCharacterSlots: [{ characterId: 12, themeColor: '#FFFFFF', clue: '', linkages: [] }],
      legacyLinkageColors: [{ key: 'red', label: '红', color: '#E5484D' }],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.puzzle).toBeNull();
    expect(result.data.legacyCharacterSlots).toHaveLength(1);
  });

  it('部署时谜题尚无参与者：空槽位数组也合法', () => {
    expect(
      mapGameSnapshotSchema.safeParse({ map, puzzle: { ...puzzle, characterSlots: [] } }).success,
    ).toBe(true);
  });

  it('rejects a snapshot that keeps the roster inside the map (v0.4.x 未升级形状)', () => {
    expect(
      mapGameSnapshotSchema.safeParse({ map: { ...map, characterSlots: [] }, puzzle }).success,
    ).toBe(false);
  });

  it('rejects an unknown top-level key', () => {
    expect(mapGameSnapshotSchema.safeParse({ map, puzzle, works: {} }).success).toBe(false);
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
