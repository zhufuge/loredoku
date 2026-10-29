import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_MAP_STYLE,
  DEFAULT_THEME_COLOR,
  MAP_JSON_VERSION,
  PUZZLE_JSON_VERSION,
  prunePuzzleReferences,
  type CharacterSlotEntry,
  type ParticipantTarget,
  type PuzzleDetail,
  type PuzzleDraft,
  type PuzzleMapContext,
} from '@loredoku/shared';
import {
  ensureEntry,
  genSlotArray,
  mapContextCells,
  mapContextRegions,
  resolveMapContextStyle,
  usePuzzleStore,
} from './puzzleStore';

const store = () => usePuzzleStore.getState();

/**
 * v0.5.0 FEAT-K01 (docs/v0.5.0.md §2.6): the puzzle editor's store. Everything
 * the map editor used to own about participants (`characterSlots`,
 * `setParticipantConfig`, `assignSlot`, the activation machine, the linkage
 * palette) moved here **verbatim** — the tests moved with it, so a regression
 * in the搬来的 logic is still caught.
 */
const CONDITIONS = [
  { x: 1, y: 2 },
  { x: 3, y: 0 },
];

function mapContext(gridSize = 6): PuzzleMapContext {
  return {
    mapId: 217,
    versionNo: 3,
    mapName: '古堡之谜',
    gridSize,
    cells: {
      '0,0': { item: { assetId: 12, w: 1, h: 1 } },
      '2,3': { background: { assetId: 7 } },
    },
    regions: [
      {
        id: 'rg_1',
        name: '花园',
        cells: [
          [0, 0],
          [1, 0],
        ],
      },
    ],
    // Q16: the read-only canvas never carries the palette.
    style: {
      ...DEFAULT_MAP_STYLE,
      gridSeparator: { width: 2, color: '#000000' },
    },
  };
}

/** v0.7.1 §5.3：底图是副本 —— 画布内容 + 来源信息，尺寸只看 `data.gridSize`。 */
function mapSnapshot(gridSize = 6) {
  return {
    mapId: 217,
    versionNo: 3,
    mapName: '古堡之谜',
    data: {
      version: MAP_JSON_VERSION,
      gridSize,
      cells: {},
      regions: [],
      style: DEFAULT_MAP_STYLE,
    },
  };
}

function detail(overrides: Partial<PuzzleDraft> = {}): PuzzleDetail {
  const draft: PuzzleDraft = {
    version: PUZZLE_JSON_VERSION,
    map: mapSnapshot(),
    name: '午夜花园',
    description: '六人六格，注意花丛的位置条件。',
    linkageColors: [
      { key: 'red', label: '红', color: '#E5484D' },
      { key: 'blue', label: '蓝', color: '#3E63DD' },
    ],
    characterSlots: Array.from({ length: 6 }, () => null),
    ...overrides,
  };
  return {
    id: 42,
    kind: 'draft',
    rootId: 42,
    versionNo: null,
    name: draft.name,
    description: draft.description,
    gridSize: draft.map.data.gridSize,
    mapId: draft.map.mapId,
    mapName: draft.map.mapName,
    mapVersionNo: draft.map.versionNo,
    coverPath: null,
    coverUrl: null,
    currentVersionNo: null,
    versionCount: 0,
    publishedAt: null,
    deployed: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    data: draft,
  };
}

beforeEach(() => {
  store().init(detail(), mapContext());
});

describe('init / read-only map context', () => {
  it('seeds the puzzle-owned fields and keeps the canvas out of the undo stack', () => {
    const state = store();
    expect(state.puzzleId).toBe(42);
    expect(state.name).toBe('午夜花园');
    expect(state.description).toBe('六人六格，注意花丛的位置条件。');
    expect(state.linkageColors.map((entry) => entry.key)).toEqual(['red', 'blue']);
    expect(state.characterSlots).toHaveLength(6);
    expect(state.dirty).toBe(false);
    expect(state.past).toHaveLength(0);
    // §2.6: the canvas is a reference, never a copy — and never undoable.
    expect(state.mapContext?.gridSize).toBe(6);
    expect(state.mapContext?.versionNo).toBe(3);
  });

  it('sizes the roster to the referenced grid size', () => {
    expect(genSlotArray(6)).toHaveLength(6);
    expect(genSlotArray(4, [null, { characterId: 1, themeColor: '#FFFFFF', clue: '', linkages: [] }])).toHaveLength(4);
  });

  it('keeps the canvas view when the same puzzle is re-seeded (FIX-O18)', () => {
    // docs/v0.5.4.md §7.5: a save writes the detail back through React Query,
    // which used to re-run `init()` and throw the board to the top-left.
    store().setPan({ x: 120, y: 80 });
    store().setZoom(1.75);
    store().init(detail({ description: '服务器上的新草稿' }), mapContext());
    expect(store().zoom).toBe(1.75);
    expect(store().pan).toEqual({ x: 120, y: 80 });
    // …but the re-seed still happened: the foreign draft is in.
    expect(store().description).toBe('服务器上的新草稿');
  });

  it('still starts centred when switching to another puzzle', () => {
    store().setPan({ x: 120, y: 80 });
    store().setZoom(1.75);
    store().init({ ...detail(), id: 99 }, mapContext());
    expect(store().zoom).toBe(1);
    expect(store().pan).toEqual({ x: 0, y: 0 });
  });
});

describe('mapContext helpers (Q16)', () => {
  it('resolves the style with no linkage palette', () => {
    const style = resolveMapContextStyle(mapContext());
    expect(style && 'linkageColors' in style).toBe(false);
    expect(style.gridSeparator).toEqual({ width: 2, color: '#000000' });
  });

  it('flattens cells and regions for the renderer', () => {
    const cells = mapContextCells(mapContext());
    expect(cells.get('0,0')?.item).toEqual({ assetId: 12, w: 1, h: 1 });
    expect(cells.size).toBe(2);
    expect(mapContextRegions(mapContext()).map((region) => region.id)).toEqual(['rg_1']);
    // A missing context must not throw — the page renders nothing.
    expect(mapContextCells(null).size).toBe(0);
    expect(mapContextRegions(null)).toEqual([]);
  });
});

describe('clearCharacterSlot', () => {
  it('frees a roster slot without touching the canvas', () => {
    store().assignSlot(12);
    const baseline = store().past.length;
    store().clearCharacterSlot(0);
    expect(store().characterSlots[0]).toBeNull();
    expect(store().dirty).toBe(true);
    expect(store().past).toHaveLength(baseline + 1);
  });

  it('restores the character to the same slot on undo', () => {
    store().assignSlot(5);
    store().assignSlot(12);
    store().clearCharacterSlot(1);
    store().undo();
    expect(store().characterSlots[1]).toMatchObject({ characterId: 12 });
    expect(store().characterSlots[0]).toMatchObject({ characterId: 5 });
  });

  it('is idempotent for rapid repeated clicks', () => {
    store().assignSlot(8);
    store().clearCharacterSlot(0);
    const history = store().past.length;
    store().clearCharacterSlot(0);
    expect(store().past).toHaveLength(history);
  });
});

describe('setParticipantConfig (CLAR-603 + MOD-801)', () => {
  it('persists theme + flat linkages on the roster slot as one atomic step', () => {
    store().assignSlot(9);
    store().setParticipantConfig(0, {
      themeColor: '#FFCC00',
      linkages: [
        { type: 'cell', cells: [[1, 1]], effect: 'highlight', color: 'red' },
        { type: 'region', id: 'rg_1', effect: 'highlight', color: 'blue' },
      ],
    });
    const slot = store().characterSlots[0];
    expect(slot?.themeColor).toBe('#FFCC00');
    expect(slot?.linkages).toHaveLength(2);
    expect(slot?.linkages?.[0]).toMatchObject({ type: 'cell', color: 'red' });
    // MOD-801: the legacy grouped `triggers` field is gone.
    expect(slot && 'triggers' in slot).toBe(false);
    expect(store().dirty).toBe(true);

    store().undo();
    const restored = store().characterSlots[0];
    expect(restored?.themeColor).toBe(DEFAULT_THEME_COLOR);
    expect(restored?.linkages).toEqual([]);
  });

  it('defensively copies the linkages array and its entries', () => {
    store().assignSlot(3);
    const linkages: ParticipantTarget[] = [
      { type: 'cell', cells: [[0, 1]], effect: 'highlight', color: 'red' },
    ];
    store().setParticipantConfig(0, { linkages });
    const stored = store().characterSlots[0]?.linkages?.[0];
    expect(stored).not.toBe(linkages[0]);
    expect(stored).toMatchObject({ type: 'cell', cells: [[0, 1]] });
  });
});

describe('MOD-802 linkage activation (single-active state machine)', () => {
  it('starts inactive and hover-activates on enter', () => {
    expect(store().activeParticipantId).toBeNull();
    expect(store().activationMode).toBeNull();
    store().activateParticipantHover(2);
    expect(store().activeParticipantId).toBe(2);
    expect(store().activationMode).toBe('hover');
  });

  it('ends a hover activation when the pointer leaves the same slot', () => {
    store().activateParticipantHover(2);
    store().deactivateParticipantHover(2);
    expect(store().activeParticipantId).toBeNull();
    expect(store().activationMode).toBeNull();
  });

  it('switches hover activation directly to the newly entered slot', () => {
    store().activateParticipantHover(2);
    store().activateParticipantHover(5);
    expect(store().activeParticipantId).toBe(5);
  });

  it('click toggles a pinned activation and ignores hover on the same slot', () => {
    store().activateParticipantClick(1);
    expect(store().activationMode).toBe('click');
    // §1.2.4: hovering the pinned participant must not change anything.
    store().activateParticipantHover(1);
    expect(store().activeParticipantId).toBe(1);
    expect(store().activationMode).toBe('click');
    store().deactivateParticipantHover(1);
    expect(store().activeParticipantId).toBe(1);
    store().activateParticipantClick(1);
    expect(store().activeParticipantId).toBeNull();
  });

  it('entering another slot auto-ends the previous activation', () => {
    store().activateParticipantClick(1);
    store().activateParticipantHover(4);
    expect(store().activeParticipantId).toBe(4);
    expect(store().activationMode).toBe('hover');
  });

  it('clearActivation force-clears (Esc)', () => {
    store().activateParticipantClick(3);
    store().clearActivation();
    expect(store().activeParticipantId).toBeNull();
    expect(store().activationMode).toBeNull();
  });

  it('resets the activation on init and applyDraft', () => {
    store().activateParticipantClick(2);
    store().init(detail({ name: '另一个' }), mapContext(4));
    expect(store().activeParticipantId).toBeNull();

    store().activateParticipantHover(1);
    store().applyDraft(detail().data);
    expect(store().activeParticipantId).toBeNull();
    expect(store().activationMode).toBeNull();
  });

  it('never enters the undo stack — activation is view state', () => {
    const baseline = store().past.length;
    store().activateParticipantHover(1);
    store().activateParticipantClick(2);
    store().clearActivation();
    expect(store().past).toHaveLength(baseline);
  });
});

describe('character roster', () => {
  it('assigns the first free slot and reports the index', () => {
    expect(store().assignSlot(9)).toBe(0);
    expect(store().characterSlots[0]).toMatchObject({ characterId: 9 });
    expect(store().assignSlot(4)).toBe(1);
  });

  it('returns null when the roster is full', () => {
    for (let index = 0; index < 6; index += 1) store().assignSlot(index + 1);
    expect(store().assignSlot(99)).toBeNull();
  });

  it('swaps two slots for drag reordering', () => {
    store().assignSlot(9);
    store().assignSlot(4);
    store().swapSlots(0, 1);
    expect(store().characterSlots[0]).toMatchObject({ characterId: 4 });
    expect(store().characterSlots[1]).toMatchObject({ characterId: 9 });
  });
});

/**
 * v0.7.13（docs/v0.7.13.md §11）—— 角色的 `color` / `displayName` 在「加入」
 * 这一刻抄进槽位。
 *
 * 关键在于**只在有值时覆盖**：绝大多数角色两个字段都是 `null`，那必须得到和
 * 今天完全一样的槽位（白色 + 无 `displayNumber` 键），否则老谜题的存档会变。
 */
describe('assignSlot 套用角色默认值（v0.7.13 §11）', () => {
  it('不传默认值 = 今天的行为：白色主题色，没有 displayNumber 键', () => {
    store().assignSlot(9);
    const slot = store().characterSlots[0]!;
    expect(slot.themeColor).toBe(DEFAULT_THEME_COLOR);
    expect(slot).not.toHaveProperty('displayNumber');
  });

  it('两个 null 与不传等价', () => {
    store().assignSlot(9, { themeColor: null, displayNumber: null });
    expect(store().characterSlots[0]!.themeColor).toBe(DEFAULT_THEME_COLOR);
    expect(store().characterSlots[0]!).not.toHaveProperty('displayNumber');
  });

  it('有值的两项都抄进槽位', () => {
    store().assignSlot(9, { themeColor: '#AABBCC', displayNumber: '甲' });
    const slot = store().characterSlots[0]!;
    expect(slot.themeColor).toBe('#AABBCC');
    expect(slot.displayNumber).toBe('甲');
  });

  it('只给主题色，编号照旧缺席；只给编号，主题色照旧是白', () => {
    store().assignSlot(9, { themeColor: '#AABBCC' });
    expect(store().characterSlots[0]!.displayNumber).toBeUndefined();

    store().assignSlot(4, { displayNumber: '乙' });
    expect(store().characterSlots[1]!.themeColor).toBe(DEFAULT_THEME_COLOR);
    expect(store().characterSlots[1]!.displayNumber).toBe('乙');
  });

  it('空白字符串当作「没有默认」，不落一个空角标', () => {
    store().assignSlot(9, { themeColor: '   ', displayNumber: '   ' });
    expect(store().characterSlots[0]!.themeColor).toBe(DEFAULT_THEME_COLOR);
    expect(store().characterSlots[0]!).not.toHaveProperty('displayNumber');
  });

  it('默认值是副本：加入之后改角色不再影响槽位', () => {
    store().assignSlot(9, { themeColor: '#AABBCC', displayNumber: '甲' });
    // 参与者抽屉里改掉 —— 槽位自己的值，改完就是改完。
    store().setParticipantConfig(0, {
      themeColor: '#000000',
      clue: '',
      linkages: [],
      positionConditions: [],
      displayNumber: '',
    });
    const slot = store().characterSlots[0]!;
    expect(slot.themeColor).toBe('#000000');
    expect(slot).not.toHaveProperty('displayNumber');
  });
});

describe('linkage palette (Q16: the puzzle owns it now)', () => {
  it('setLinkageColors replaces the palette in one undoable step', () => {
    const baseline = store().past.length;
    store().setLinkageColors([
      { key: 'red', label: '红', color: '#EF9A9A' },
      { key: 'teal', label: '青', color: '#0B7E74' },
    ]);
    expect(store().linkageColors[1]).toEqual({ key: 'teal', label: '青', color: '#0B7E74' });
    expect(store().past).toHaveLength(baseline + 1);
    store().undo();
    expect(store().linkageColors.map((entry) => entry.key)).toEqual(['red', 'blue']);
  });

  it('removing an entry re-points the linkages that used it', () => {
    store().setLinkageColors([
      { key: 'red', label: '红', color: '#EF9A9A' },
      { key: 'blue', label: '蓝', color: '#90CAF9' },
      { key: 'teal', label: '青', color: '#0B7E74' },
    ]);
    store().assignSlot(4);
    store().setParticipantConfig(0, {
      linkages: [
        { type: 'cell', cells: [[0, 0]], effect: 'highlight', color: 'blue' },
        { type: 'cell', cells: [[1, 1]], effect: 'highlight', color: 'teal' },
      ],
    });
    store().removeLinkageColor('blue');
    // The removed key is gone and its references point at the first entry.
    expect(store().linkageColors.map((entry) => entry.key)).toEqual(['red', 'teal']);
    expect(store().characterSlots[0]?.linkages?.map((entry) => entry.color)).toEqual([
      'red',
      'teal',
    ]);
  });

  it('refuses to drop below the 2-entry minimum, without committing anything', () => {
    store().removeLinkageColor('blue');
    expect(store().linkageColors.map((entry) => entry.key)).toEqual(['red', 'blue']);
    expect(store().past).toHaveLength(0);
    expect(store().dirty).toBe(false);
  });
});

describe('setBasicInfo (SPEC-K05: one gesture = one undo step)', () => {
  it('commits description + palette + re-pointed roster together', () => {
    store().setLinkageColors([
      { key: 'red', label: '红', color: '#EF9A9A' },
      { key: 'blue', label: '蓝', color: '#90CAF9' },
      { key: 'teal', label: '青', color: '#0B7E74' },
    ]);
    store().assignSlot(4);
    store().setParticipantConfig(0, {
      linkages: [{ type: 'region', id: 'rg_1', effect: 'highlight', color: 'teal' }],
    });
    const baseline = store().past.length;

    store().setBasicInfo({
      name: '午夜花园',
      description: '改过的描述',
      // v0.7.14：题面随「基本信息」一起提交，空值也要显式写出来。
      clues: [],
      ending: '',
      linkageColors: [
        { key: 'red', label: '红', color: '#EF9A9A' },
        { key: 'blue', label: '蓝', color: '#90CAF9' },
      ],
      // The drawer re-points the roster before handing it over.
      characterSlots: [
        {
          characterId: 4,
          themeColor: '#FFFFFF',
          clue: '',
          linkages: [{ type: 'region', id: 'rg_1', effect: 'highlight', color: 'blue' }],
        },
        null,
        null,
        null,
        null,
        null,
      ],
      // v0.6.3 §3: the layout column count is part of the same gesture.
      rosterCols: 3,
    });

    expect(store().description).toBe('改过的描述');
    expect(store().linkageColors.map((entry) => entry.key)).toEqual(['red', 'blue']);
    expect(store().characterSlots[0]?.linkages?.[0]?.color).toBe('blue');
    expect(store().rosterCols).toBe(3);
    // Exactly one step for the whole form.
    expect(store().past).toHaveLength(baseline + 1);
    store().undo();
    expect(store().description).toBe('六人六格，注意花丛的位置条件。');
    expect(store().linkageColors.map((entry) => entry.key)).toEqual(['red', 'blue', 'teal']);
    expect(store().characterSlots[0]?.linkages?.[0]?.color).toBe('teal');
    // v0.6.3 §3: the layout goes back too — it is one of the basics.
    expect(store().rosterCols).toBeNull();
  });

  /**
   * v0.6.3 §3.1: the fixture carries no `rosterCols`, which is what a puzzle
   * saved before this version looks like. It must load as 自动, not as 0.
   */
  it('reads a legacy puzzle as 自动', () => {
    expect(store().rosterCols).toBeNull();
  });
});

/**
 * v0.7.3 §3.3：引入新地图。换的只是底图（连同它的名称 / 版本 / 画布），谜题
 * 自己的字段一个不动；底图进快照，所以撤销能把旧底图换回来。
 */
describe('replaceMapContext (v0.7.3 §3.3)', () => {
  /** 另一张同尺寸地图 —— 区域 id 与旧画布不重叠。 */
  function swapped(): PuzzleMapContext {
    return {
      mapId: 318,
      versionNo: 1,
      mapName: '新地图',
      gridSize: 6,
      cells: { '1,1': { item: { assetId: 34, w: 1, h: 1 } } },
      regions: [{ id: 'rg_new', name: '新区域', cells: [[1, 1]] }],
      style: DEFAULT_MAP_STYLE,
    };
  }

  it('swaps only the canvas and leaves the puzzle-owned fields alone', () => {
    store().setBasicInfo({
      name: '改过的名字',
      description: '改过的描述',
      clues: [],
      ending: '',
      linkageColors: store().linkageColors,
      characterSlots: store().characterSlots,
      rosterCols: 2,
    });
    const baseline = store().past.length;

    store().replaceMapContext(swapped());

    expect(store().mapContext?.mapId).toBe(318);
    expect(store().name).toBe('改过的名字');
    expect(store().description).toBe('改过的描述');
    expect(store().rosterCols).toBe(2);
    expect(store().characterSlots).toHaveLength(6);
    // 一个撤销步，且这一屏确实变了。
    expect(store().past).toHaveLength(baseline + 1);
    expect(store().dirty).toBe(true);
    // 选择与参与者激活都在描述旧画布上的东西，换完就不再成立。
    expect(store().selection).toBeNull();
    expect(store().activeParticipantId).toBeNull();
    expect(store().selectedSlotIndex).toBeNull();
  });

  it('undo brings the old canvas back', () => {
    store().replaceMapContext(swapped());
    store().undo();
    expect(store().mapContext?.mapId).toBe(217);
    expect(store().mapContext?.versionNo).toBe(3);
    expect(store().toDraft().map.data.regions.map((region) => region.id)).toEqual(['rg_1']);
  });

  it('writes the new canvas into the draft', () => {
    store().replaceMapContext(swapped());
    expect(store().toDraft().map).toMatchObject({
      mapId: 318,
      versionNo: 1,
      mapName: '新地图',
    });
    expect(store().toDraft().map.data.regions.map((region) => region.id)).toEqual(['rg_new']);
  });

  it('lands the pruned roster and the new canvas in one undo step', () => {
    store().assignSlot(4);
    store().setParticipantConfig(0, {
      linkages: [{ type: 'region', id: 'rg_1', effect: 'highlight', color: 'red' }],
    });
    const next = swapped();
    const pruned = prunePuzzleReferences(store().characterSlots, {
      cells: next.cells,
      regions: next.regions,
    });
    expect(pruned.removed).toHaveLength(1);
    const baseline = store().past.length;

    store().replaceMapContext(next, pruned.slots);

    expect(store().past).toHaveLength(baseline + 1);
    expect(store().mapContext?.mapId).toBe(318);
    expect(store().characterSlots[0]?.linkages).toEqual([]);
    // 一次撤销把两半一起换回来。
    store().undo();
    expect(store().mapContext?.mapId).toBe(217);
    expect(store().characterSlots[0]?.linkages).toHaveLength(1);
  });

  it('ignores a no-op swap', () => {
    store().replaceMapContext(mapContext());
    expect(store().past).toHaveLength(0);
    expect(store().dirty).toBe(false);
  });
});

describe('positionConditions survives (BUG-J04 §4, §15 Q11)', () => {
  /** A draft whose first slot is filled and configurable. */
  function withRoster(): PuzzleDraft {
    return {
      ...detail().data,
      characterSlots: [
        { characterId: 8, themeColor: '#FFCC00', clue: '', linkages: [] },
        null,
        null,
        null,
        null,
        null,
      ],
    };
  }

  function load(draftToLoad: PuzzleDraft): void {
    store().init(detail(draftToLoad), mapContext(draftToLoad.map.data.gridSize));
  }

  it('survives init — a page reload no longer drops the list', () => {
    const loaded = withRoster();
    loaded.characterSlots[0] = {
      characterId: 8,
      themeColor: '#FFCC00',
      clue: '',
      linkages: [],
      positionConditions: CONDITIONS,
    };
    load(loaded);
    expect(store().characterSlots[0]?.positionConditions).toEqual(CONDITIONS);
  });

  it('survives the next save — filling participant 2 keeps participant 1 intact', () => {
    load(withRoster());
    store().assignSlot(9);
    store().setParticipantConfig(0, {
      themeColor: '#FFCC00',
      clue: '',
      linkages: [],
      positionConditions: CONDITIONS,
    });
    store().setParticipantConfig(1, {
      themeColor: '#00FFCC',
      clue: '',
      linkages: [],
      positionConditions: [{ x: 0, y: 0 }],
    });
    expect(store().characterSlots[0]?.positionConditions).toEqual(CONDITIONS);
    expect(store().characterSlots[1]?.positionConditions).toEqual([{ x: 0, y: 0 }]);
  });

  it('survives an unrelated commit', () => {
    load(withRoster());
    store().setParticipantConfig(0, {
      themeColor: '#FFCC00',
      clue: '',
      linkages: [],
      positionConditions: CONDITIONS,
    });
    store().setDescription('无关的编辑');
    store().setLinkageColors([
      { key: 'red', label: '红', color: '#EF9A9A' },
      { key: 'teal', label: '青', color: '#0B7E74' },
    ]);
    expect(store().characterSlots[0]?.positionConditions).toEqual(CONDITIONS);
  });

  it('reaches toDraft — what the server stores now carries it', () => {
    load(withRoster());
    store().setParticipantConfig(0, {
      themeColor: '#FFCC00',
      clue: '',
      linkages: [],
      positionConditions: CONDITIONS,
    });
    expect(store().toDraft().characterSlots[0]?.positionConditions).toEqual(CONDITIONS);
  });

  it('defensively copies the list on the way in', () => {
    load(withRoster());
    const conditions = [{ x: 1, y: 1 }];
    store().setParticipantConfig(0, {
      themeColor: '#FFFFFF',
      clue: '',
      linkages: [],
      positionConditions: conditions,
    });
    const stored = store().characterSlots[0]?.positionConditions;
    expect(stored).not.toBe(conditions);
    expect(stored?.[0]).not.toBe(conditions[0]);
    conditions[0]!.x = 9;
    expect(store().characterSlots[0]?.positionConditions).toEqual([{ x: 1, y: 1 }]);
  });

  it('stores an empty list as an absent field, never a dead array', () => {
    load(withRoster());
    store().setParticipantConfig(0, {
      themeColor: '#FFFFFF',
      clue: '',
      linkages: [],
      positionConditions: [],
    });
    const entry = store().characterSlots[0];
    expect(entry).not.toBeNull();
    expect(entry && 'positionConditions' in entry).toBe(false);
  });

  it('keeps a normalised entry’s identity across commits (§9 Q7)', () => {
    load(withRoster());
    store().setParticipantConfig(0, {
      themeColor: '#FFCC00',
      clue: '',
      linkages: [],
      positionConditions: CONDITIONS,
    });
    const entry = store().characterSlots[0];
    // An unrelated edit must not swap the entry object out — that is what made
    // `ParticipantDrawer`'s `[open, slot]` effect re-seed (and drop unsaved
    // local edits) on every commit.
    store().setDescription('无关的编辑');
    expect(store().characterSlots[0]).toBe(entry);
    // A real change to that slot still produces a new object.
    store().setParticipantConfig(0, {
      themeColor: '#123456',
      clue: '',
      linkages: [],
      positionConditions: CONDITIONS,
    });
    expect(store().characterSlots[0]).not.toBe(entry);
  });
});

/**
 * v0.6.4 (docs/v0.6.4.md §2): the per-participant 编号展示 text.
 *
 * The field lives on the slot entry, so the same rules that kept
 * `positionConditions` alive across BUG-J04 apply: it must survive init, an
 * unrelated commit and `toDraft` — and a cleared one is stored absent, the
 * same "no dead array" discipline.
 */
describe('displayNumber survives (v0.6.4 §2)', () => {
  function withRoster(): PuzzleDraft {
    return {
      ...detail().data,
      characterSlots: [
        { characterId: 8, themeColor: '#FFCC00', clue: '', linkages: [] },
        null,
        null,
        null,
        null,
        null,
      ],
    };
  }

  function load(draftToLoad: PuzzleDraft): void {
    store().init(detail(draftToLoad), mapContext(draftToLoad.map.data.gridSize));
  }

  const patch = (displayNumber: string) => ({
    themeColor: '#FFCC00',
    clue: '',
    linkages: [],
    positionConditions: [],
    displayNumber,
  });

  it('survives init — a puzzle saved with a label reloads with it', () => {
    const loaded = withRoster();
    loaded.characterSlots[0] = { ...loaded.characterSlots[0]!, displayNumber: '甲' };
    load(loaded);
    expect(store().characterSlots[0]?.displayNumber).toBe('甲');
  });

  it('reaches toDraft — what the server stores now carries it', () => {
    load(withRoster());
    store().setParticipantConfig(0, patch('K1'));
    expect(store().toDraft().characterSlots[0]?.displayNumber).toBe('K1');
  });

  it('survives an unrelated commit', () => {
    load(withRoster());
    store().setParticipantConfig(0, patch('甲'));
    store().setDescription('无关的编辑');
    expect(store().characterSlots[0]?.displayNumber).toBe('甲');
  });

  it('keeps the entry across a swapSlots — the label travels with its participant', () => {
    load(withRoster());
    store().assignSlot(9);
    store().setParticipantConfig(0, patch('甲'));
    store().swapSlots(0, 1);
    // The entry (and its label) moved; only the sequence number changed.
    expect(store().characterSlots[1]).toMatchObject({ characterId: 8, displayNumber: '甲' });
    expect(store().characterSlots[0]).toMatchObject({ characterId: 9 });
    expect(store().characterSlots[0]?.displayNumber).toBeUndefined();
  });

  it('trims on the way in and stores a cleared label as absent', () => {
    load(withRoster());
    store().setParticipantConfig(0, patch('  7  '));
    expect(store().characterSlots[0]?.displayNumber).toBe('7');

    store().setParticipantConfig(0, patch('   '));
    const entry = store().characterSlots[0];
    expect(entry).not.toBeNull();
    expect(entry && 'displayNumber' in entry).toBe(false);
  });

  it('an omitted patch field keeps what is stored', () => {
    load(withRoster());
    store().setParticipantConfig(0, patch('甲'));
    store().setParticipantConfig(0, {
      themeColor: '#123456',
      clue: '',
      linkages: [],
      positionConditions: [],
    });
    expect(store().characterSlots[0]?.displayNumber).toBe('甲');
  });
});

describe('toDraft / applyDraft (FEAT-K08)', () => {
  it('serialises the canvas copy along with the source info', () => {
    store().assignSlot(4);
    const output = store().toDraft();
    expect(output.version).toBe(PUZZLE_JSON_VERSION);
    // 来源信息（展示 / 追溯）+ 一份画布副本；尺寸的唯一真源是 `data.gridSize`。
    expect(output.map).toMatchObject({ mapId: 217, versionNo: 3, mapName: '古堡之谜' });
    expect(output.map.data.gridSize).toBe(6);
    expect(output.map.data.version).toBe(MAP_JSON_VERSION);
    expect(output.map.data.cells['0,0']?.item?.assetId).toBe(12);
    expect(output.map.data.regions.map((region) => region.id)).toEqual(['rg_1']);
    expect(output.name).toBe('午夜花园');
    expect(output.description).toBe('六人六格，注意花丛的位置条件。');
    expect(output.linkageColors.map((entry) => entry.key)).toEqual(['red', 'blue']);
    expect(output.characterSlots[0]).toMatchObject({ characterId: 4, linkages: [] });
  });

  /**
   * v0.6.3 §3.1: the column count has to leave the editor, because the game
   * page reads it straight out of the deployed snapshot.
   */
  it('carries the layout column count to the server', () => {
    store().setBasicInfo({
      name: '午夜花园',
      description: '六人六格，注意花丛的位置条件。',
      clues: [],
      ending: '',
      linkageColors: store().linkageColors,
      characterSlots: store().characterSlots,
      rosterCols: 2,
    });
    expect(store().toDraft().rosterCols).toBe(2);
    // 自动 is stored as `null`, not dropped — the field is always present.
    store().setBasicInfo({
      name: '午夜花园',
      description: '六人六格，注意花丛的位置条件。',
      clues: [],
      ending: '',
      linkageColors: store().linkageColors,
      characterSlots: store().characterSlots,
      rosterCols: null,
    });
    expect(store().toDraft().rosterCols).toBeNull();
  });

  /**
   * v0.7.14：题面必须跟着草稿走 —— 全局线索与结束语不到服务端，游戏页拿到的
   * 就永远是一张只有描述的纸片，玩家侧的结束语也无从出现。
   */
  it('carries the 题面 to the server (全局线索 + 结束语)', () => {
    store().setBasicInfo({
      name: '午夜花园',
      description: '六人六格。',
      clues: ['同一行里没有重复编号', '阴影里没有编号'],
      ending: '灯灭了，花园还在。',
      linkageColors: store().linkageColors,
      characterSlots: store().characterSlots,
      rosterCols: null,
    });
    const draft = store().toDraft();
    expect(draft.clues).toEqual(['同一行里没有重复编号', '阴影里没有编号']);
    expect(draft.ending).toBe('灯灭了，花园还在。');
  });

  /**
   * 旧数据没有这两个键（v0.7.14 之前保存的草稿、已发布的版本行）。导入或恢复
   * 之后 store 里必须是「空」而不是 `undefined` —— 抽屉的草稿与 dirty 比较都
   * 假设它们是 `string[]` / `string`。
   */
  it('absorbs a v0.7.14-less draft as empty 题面', () => {
    const legacy: PuzzleDraft = {
      version: PUZZLE_JSON_VERSION,
      map: mapSnapshot(),
      name: '旧谜题',
      description: '没有题面字段',
      linkageColors: store().linkageColors,
      characterSlots: store().characterSlots,
      rosterCols: null,
    };
    store().applyDraft(legacy);
    expect(store().clues).toEqual([]);
    expect(store().ending).toBe('');
  });

  it('round-trips through applyDraft', () => {
    const imported: PuzzleDraft = {
      version: PUZZLE_JSON_VERSION,
      map: mapSnapshot(),
      name: '导入的谜题',
      description: '导入来的',
      linkageColors: [
        { key: 'red', label: '红', color: '#EF9A9A' },
        { key: 'teal', label: '青', color: '#0B7E74' },
      ],
      characterSlots: [
        { characterId: 8, themeColor: '#FFCC00', clue: '线索', linkages: [] },
        null,
        null,
        null,
        null,
        null,
      ],
      // v0.6.3 §3: an imported layout survives the import.
      rosterCols: 3,
    };
    store().applyDraft(imported);
    const state = store();
    expect(state.name).toBe('导入的谜题');
    expect(state.description).toBe('导入来的');
    expect(state.linkageColors.map((entry) => entry.key)).toEqual(['red', 'teal']);
    expect(state.characterSlots[0]).toMatchObject({ characterId: 8, clue: '线索' });
    expect(state.rosterCols).toBe(3);
    // §6: import is undoable, and it never re-points the map reference.
    expect(state.dirty).toBe(true);
    expect(state.mapContext?.versionNo).toBe(3);
    store().undo();
    expect(store().name).toBe('午夜花园');
  });

  it('applyDraft resizes the roster to the referenced grid size', () => {
    store().applyDraft({
      ...detail().data,
      map: mapSnapshot(4),
      characterSlots: [null, null],
    });
    expect(store().characterSlots).toHaveLength(6);
  });
});

describe('history limits', () => {
  it('caps the undo stack at MAX_HISTORY_STEPS', () => {
    for (let index = 0; index < 60; index += 1) {
      store().setDescription(`描述 ${index}`);
    }
    expect(store().past.length).toBeLessThanOrEqual(50);
    expect(store().future).toHaveLength(0);
  });

  it('undo / redo walk the description back and forth', () => {
    store().setDescription('第一版');
    store().setDescription('第二版');
    store().undo();
    expect(store().description).toBe('第一版');
    store().redo();
    expect(store().description).toBe('第二版');
  });
});

describe('markSaved', () => {
  it('clears the dirty flag and records the server timestamp', () => {
    store().setDescription('改过');
    expect(store().dirty).toBe(true);
    store().markSaved('2026-02-02T00:00:00.000Z');
    expect(store().dirty).toBe(false);
    expect(store().updatedAt).toBe('2026-02-02T00:00:00.000Z');
  });
});

describe('adoptSavedEntry (v0.7.2 §3.3 fork 落库后接管新行)', () => {
  it('只换身份，画布 / 撤销栈 / 视口都不动', () => {
    store().setDescription('改过');
    store().setZoom(1.6);
    store().setPan({ x: 40, y: -12 });
    const canvasBefore = store().mapContext;
    const historyBefore = store().past.length;

    store().adoptSavedEntry({
      ...detail(),
      id: 88,
      versionNo: null,
      data: { ...detail().data, name: '午夜花园 (自 v2)' },
      updatedAt: '2026-03-03T00:00:00.000Z',
    });

    const state = store();
    expect(state.puzzleId).toBe(88);
    // 名称/描述来自新行，徽标回到「草稿」。
    expect(state.name).toBe('午夜花园 (自 v2)');
    expect(state.description).toBe('六人六格，注意花丛的位置条件。');
    expect(state.status).toBe('draft');
    expect(state.updatedAt).toBe('2026-03-03T00:00:00.000Z');
    expect(state.dirty).toBe(false);
    // 画布、历史、视口原地不动 —— 内容就是刚写进去的那份。
    expect(state.mapContext).toBe(canvasBefore);
    expect(state.past).toHaveLength(historyBefore);
    expect(state.zoom).toBe(1.6);
    expect(state.pan).toEqual({ x: 40, y: -12 });
  });
});

describe('ensureEntry / genSlotArray (pure helpers)', () => {
  it('ensureEntry returns null for an empty slot', () => {
    expect(ensureEntry(null)).toBeNull();
  });

  it('ensureEntry returns an already-normalised entry by identity', () => {
    const entry: CharacterSlotEntry = {
      characterId: 1,
      themeColor: '#FFFFFF',
      clue: '',
      linkages: [],
    };
    expect(ensureEntry(entry)).toBe(entry);
  });

  it('ensureEntry fills the missing fields with defaults', () => {
    const entry = ensureEntry({ characterId: 1 });
    expect(entry).toEqual({
      characterId: 1,
      themeColor: DEFAULT_THEME_COLOR,
      clue: '',
      linkages: [],
    });
  });

  it('genSlotArray preserves what fits and pads with null', () => {
    const slots = genSlotArray(3, [{ characterId: 1 } as CharacterSlotEntry]);
    expect(slots).toHaveLength(3);
    expect(slots[0]).toMatchObject({ characterId: 1 });
    expect(slots[1]).toBeNull();
    expect(slots[2]).toBeNull();
  });
});
