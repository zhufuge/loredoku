import { create } from 'zustand';
import {
  DEFAULT_THEME_COLOR,
  GAME_TOOL_ICON_KINDS,
  LINKAGE_COLOR_MIN_COUNT,
  MAP_JSON_VERSION,
  MAX_HISTORY_STEPS,
  PUZZLE_JSON_VERSION,
  type CharacterSlotEntry,
  type DraftCell,
  type DraftRegion,
  type UploadedImage,
  type GameToolIcons,
  type MapLinkageColor,
  type MapStyle,
  type ParticipantTarget,
  type MapStatus,
  type PuzzleDetail,
  type PuzzleDraft,
  type PuzzleMapContext,
} from '@loredoku/shared';
import { resolveLinkageColors, retargetLinkageColors, resolveMapStyle } from '@/lib/mapStyle';
import {
  INACTIVE_ACTIVATION,
  reduceLinkageActivation,
  type ActivationMode,
} from '@/lib/linkageActivation';

/** v0.5.0 FEAT-K01 (docs/v0.5.0.md §2.6)：谜题编辑器 store；`mapContext` 只读，唯一写入口是 `replaceMapContext`。 */
export type PuzzleSelection =
  | { type: 'cell'; x: number; y: number }
  | { type: 'region'; regionId: string };

/** v0.7.13 (docs/v0.7.13.md §11)：角色带入槽位的默认值；`null` = 无默认，回落到 `DEFAULT_THEME_COLOR` / 序号。 */
export interface ParticipantDefaults {
  /** `characters.color` — the participant 主题色. */
  themeColor?: string | null;
  /** `characters.displayName` — the badge text instead of the sequence number. */
  displayNumber?: string | null;
}

/** Builds a roster sized to `size`, preserving whatever is already there. */
export function genSlotArray(
  size: number,
  existing: Array<CharacterSlotEntry | null> = [],
): Array<CharacterSlotEntry | null> {
  return Array.from({ length: size }, (_, index) => existing[index] ?? null);
}

/**
 * BUG-J04 (docs/v0.4.3.md §4.2)：必须覆盖 `CharacterSlotEntry` 的每个字段，漏掉会丢数据；已归一化的条目按**同一引用**返回（依赖 `[open, slot]` 的 seeding effect 靠它停火）。
 */
export function ensureEntry(entry: CharacterSlotEntry | null): CharacterSlotEntry | null {
  if (!entry) return null;
  if (entry.themeColor != null && entry.clue != null && entry.linkages != null) return entry;
  const conditions = entry.positionConditions ?? [];
  return {
    characterId: entry.characterId,
    themeColor: entry.themeColor ?? DEFAULT_THEME_COLOR,
    clue: entry.clue ?? '',
    linkages: (entry.linkages ?? []).map((linkage) => ({ ...linkage })),
    // FEAT-E01 §7.4: an empty list means "no positional constraint", so it is
    // stored as an absent field — the same rule `setParticipantConfig` uses.
    ...(conditions.length > 0
      ? { positionConditions: conditions.map((condition) => ({ ...condition })) }
      : {}),
    // v0.6.4 §2: the configured 编号展示 survives normalisation like every
    // other optional field — a cleared one stays absent, not `undefined`.
    ...(entry.displayNumber?.trim()
      ? { displayNumber: entry.displayNumber.trim() }
      : {}),
  };
}

/** The undoable half of the state. */
interface Snapshot {
  name: string;
  description: string;
  /** 题面 —— 全局线索与结束语，和描述一样属于「谜题自己写的东西」。 */
  clues: string[];
  ending: string;
  linkageColors: MapLinkageColor[];
  characterSlots: Array<CharacterSlotEntry | null>;
  /** v0.6.3 (docs/v0.6.3.md §3): `null` = 自动. */
  rosterCols: number | null;
  /**
   * v0.8.6 §4：玩家侧「标记」用哪张上传图。`null` = 默认的 `×` 字形。
   */
  mark: UploadedImage | null;
  /**
   * v0.8.7 §7：工具按钮图标（清除 / 撤回 / 提交）。`null` = 三枚都跟随主题。
   */
  toolIcons: GameToolIcons | null;
  /** v0.7.3 §4：底图也可撤销（否则会留下「新底图 + 旧联动」的半截状态）；引用级存放，只读，不深拷贝。 */
  mapContext: PuzzleMapContext | null;
}

export interface PuzzleState {
  puzzleId: number | null;
  /** Read-only canvas of the referenced map version. `replaceMapContext` 之外没人写它。 */
  mapContext: PuzzleMapContext | null;

  // ---- puzzle-owned, undoable ----
  name: string;
  description: string;
  /** v0.7.14（docs/v0.7.14.md §2）：全局线索。空行在提交时被过滤掉， 所以进入 store 的每一条都是「作者真写了东西」的。 */
  clues: string[];
  /** 结束语；空串 = 不显示。 */
  ending: string;
  linkageColors: MapLinkageColor[];
  characterSlots: Array<CharacterSlotEntry | null>;
  /** v0.6.3 (docs/v0.6.3.md §3): the roster matrix's column count, owned by the puzzle. It rides in the undo stack with the rest of the basics, so 撤销 takes a layout change back too. */
  rosterCols: number | null;
  /** v0.8.6（docs/v0.8.6.md §4）：玩家在游戏页标记排除项时画面上显示的那枚符号。 `null` = 默认的 `×` 字形；非 null 时渲染上传的那张图。 */
  mark: UploadedImage | null;
  /** v0.8.7 §7：游戏页右列三枚动作按钮的画。`null` = 三枚都跟随主题的 `ThemeData.toolIcons`，主题也没有就用内置图标。 */
  toolIcons: GameToolIcons | null;

  // ---- view / focus (never in the undo stack) ----
  selection: PuzzleSelection | null;
  selectedSlotIndex: number | null;
  activeParticipantId: number | null;
  activationMode: ActivationMode | null;
  zoom: number;
  pan: { x: number; y: number };

  // ---- persistence ----
  dirty: boolean;
  updatedAt: string | null;
  status: MapStatus;
  past: Snapshot[];
  future: Snapshot[];

  /** Seeds everything from the puzzle detail + its read-only canvas. */
  init: (detail: PuzzleDetail, mapContext: PuzzleMapContext) => void;
  setDescription: (text: string) => void;
  setLinkageColors: (colors: MapLinkageColor[]) => void;
  removeLinkageColor: (key: string) => void;
  /**
   * SPEC-K05 (docs/v0.5.0.md §4.2) + v0.6.3 §3 + v0.7.3 §2.2: the 「谜题基本信息」 drawer commits name / description / palette / roster / column count as one gesture — one 保存, one undo step; the name must go through here (`savePuzzleDraft` mirrors it back to `puzzles.name`).
   */
  setBasicInfo: (patch: {
    name: string;
    description: string;
    clues: string[];
    ending: string;
    linkageColors: MapLinkageColor[];
    characterSlots: Array<CharacterSlotEntry | null>;
    rosterCols: number | null;
    /** v0.8.6 §4：`null` = 默认的 `×` 字形。 */
    mark: UploadedImage | null;
    /** v0.8.7 §7：工具按钮图标；`null` = 三枚都跟随主题。 */
    toolIcons: GameToolIcons | null;
  }) => void;
  setParticipantConfig: (
    slotIndex: number,
    patch: {
      themeColor?: string;
      clue?: string;
      linkages?: ParticipantTarget[];
      positionConditions?: Array<{ x: number; y: number }>;
      /** v0.6.4 (docs/v0.6.4.md §2): the configured 编号展示 text. Omitted = keep what is stored; a blank string clears it back to the sequence number. */
      displayNumber?: string | null;
    },
  ) => void;
  /** Puts the character in the first free slot; `defaults` copies the character's own 主题色 / 编号 in **at assignment time only** — the slot then owns a copy (v0.7.13, docs/v0.7.13.md §11). */
  assignSlot: (characterId: number, defaults?: ParticipantDefaults) => number | null;
  clearCharacterSlot: (index: number) => void;
  swapSlots: (from: number, to: number) => void;
  setSelectedSlot: (index: number | null) => void;
  activateParticipantHover: (participantId: number) => void;
  deactivateParticipantHover: (participantId: number) => void;
  activateParticipantClick: (participantId: number) => void;
  clearActivation: () => void;
  setSelection: (selection: PuzzleSelection | null) => void;
  /** v0.7.3 §3.3：引入新地图 —— 只换底图（连同它的名称 / 版本 / 画布），谜题自己的字段一个不动。一个撤销步，撤销后底图也一起换回来。 `characterSlots` 是**同一笔**改动的一部分：换底图时，指向旧画布的联动目标（`asset` / `region`）已经不存在，必须一起摘掉，否则这份草稿再也存不进去（服务端 `assertReferenceIssues` 会 400）。分开提交就会变成两个撤销步。 */
  replaceMapContext: (
    context: PuzzleMapContext,
    characterSlots?: Array<CharacterSlotEntry | null>,
  ) => void;
  setZoom: (zoom: number) => void;
  setPan: (pan: { x: number; y: number }) => void;
  resetView: () => void;
  undo: () => void;
  redo: () => void;
  markSaved: (updatedAt: string) => void;
  /** 「保存时才生成草稿」落库之后接管新行：只换身份（id / 名称 / 描述 / `updatedAt` / `status`），画布、撤销栈与视口一个都不动 —— 内容就是刚写进去的那份，重新 `init` 只会把缩放打回 1×、把历史清空。 */
  adoptSavedEntry: (detail: PuzzleDetail) => void;
  /** FEAT-K08: the whole draft, ready for save / export. */
  toDraft: () => PuzzleDraft;
  /** FEAT-K08: import / undo — replaces only the puzzle-owned fields. */
  applyDraft: (draft: PuzzleDraft) => void;
}

/** v0.8.6 §4：标记图是平坦的 `{ path }`，复制一层就和来源脱钩了（撤销栈 / 草稿都不能和「此刻」共用一个对象）。 */
function cloneMark(ref: UploadedImage | null): UploadedImage | null {
  return ref ? { ...ref } : null;
}

/** v0.8.7 §7：三枚工具图标也是平坦的 `{ path }`，逐枚复制一层。空的 / 全是空位的对象归一化成 `null` —— 与「从没配过」同一个口径，序列化时也就不留空壳。 */
function cloneToolIcons(icons: GameToolIcons | null | undefined): GameToolIcons | null {
  if (!icons) return null;
  const next: GameToolIcons = {};
  for (const kind of GAME_TOOL_ICON_KINDS) {
    const ref = icons[kind];
    if (ref?.path) next[kind] = { ...ref };
  }
  return Object.keys(next).length > 0 ? next : null;
}

function snapshot(state: PuzzleState): Snapshot {
  return {
    name: state.name,
    description: state.description,
    // 复制一份：撤销栈里的快照不能和「此刻」共用一个数组。
    clues: [...state.clues],
    ending: state.ending,
    linkageColors: state.linkageColors.map((entry) => ({ ...entry })),
    characterSlots: state.characterSlots.map(ensureEntry),
    rosterCols: state.rosterCols,
    mark: cloneMark(state.mark),
    toolIcons: cloneToolIcons(state.toolIcons),
    mapContext: state.mapContext,
  };
}

/** The read-only canvas as the renderer wants it (palette stripped — Q16). */
export function resolveMapContextStyle(context: PuzzleMapContext | null): MapStyle {
  return resolveMapStyle(context?.style);
}

export function mapContextCells(context: PuzzleMapContext | null): Map<string, DraftCell> {
  const cells = new Map<string, DraftCell>();
  const source = context?.cells ?? {};
  for (const key of Object.keys(source)) {
    const cell = source[key];
    if (cell) cells.set(key, cell);
  }
  return cells;
}

export function mapContextRegions(context: PuzzleMapContext | null): DraftRegion[] {
  return context?.regions ?? [];
}

export const usePuzzleStore = create<PuzzleState>((set, get) => {
  function commit(mutate: (next: Snapshot) => void): void {
    const state = get();
    const next = snapshot(state);
    mutate(next);
    const past = [...state.past, snapshot(state)].slice(-MAX_HISTORY_STEPS);
    set({ ...next, past, future: [], dirty: true });
  }

  return {
    puzzleId: null,
    mapContext: null,
    name: '',
    description: '',
    clues: [],
    ending: '',
    linkageColors: resolveLinkageColors(undefined),
    characterSlots: [],
    rosterCols: null,
    mark: null,
    toolIcons: null,
    selection: null,
    selectedSlotIndex: null,
    activeParticipantId: null,
    activationMode: null,
    zoom: 1,
    pan: { x: 0, y: 0 },
    dirty: false,
    updatedAt: null,
    status: 'draft',
    past: [],
    future: [],

    /** FIX-O18 (docs/v0.5.4.md §7.5): re-initialising the **same** puzzle keeps `zoom` / `pan` (a successful save re-seeds through React Query); switching to another puzzle still starts centred at 1×. */
    init: (detail, mapContext) =>
      set((state) => {
        const samePuzzle = state.puzzleId === detail.id;
        return {
        puzzleId: detail.id,
        mapContext,
        name: detail.data.name,
        description: detail.data.description ?? '',
        // 旧行没有这两个键，读进来一律给「空」而不是 undefined ——
        // 抽屉的草稿与 dirty 比较都假设它们是 string / string[]。
        clues: [...(detail.data.clues ?? [])],
        ending: detail.data.ending ?? '',
        linkageColors: resolveLinkageColors(detail.data.linkageColors),
        characterSlots: genSlotArray(
          mapContext.gridSize,
          detail.data.characterSlots,
        ).map(ensureEntry),
        rosterCols: detail.data.rosterCols ?? null,
        // v0.8.6 §4：旧行没有这个键，读进来是「默认 ×」而不是 undefined。
        mark: cloneMark(detail.data.mark ?? null),
        // v0.8.7 §7：同理，旧行没有 `toolIcons` = 三枚都跟随主题。
        toolIcons: cloneToolIcons(detail.data.toolIcons),
        selection: null,
        selectedSlotIndex: null,
        ...INACTIVE_ACTIVATION,
        zoom: samePuzzle ? state.zoom : 1,
        pan: samePuzzle ? state.pan : { x: 0, y: 0 },
        dirty: false,
        updatedAt: detail.updatedAt,
        // 版本行一发布就不可写，所以「已发布」只可能是版本行；草稿行恒为草稿。
        status: detail.kind === 'version' ? 'published' : 'draft',
        past: [],
        future: [],
        };
      }),

    setDescription: (text) =>
      commit((next) => {
        next.description = text;
      }),

    setLinkageColors: (colors) =>
      commit((next) => {
        next.linkageColors = resolveLinkageColors(colors);
      }),

    setBasicInfo: (patch) =>
      commit((next) => {
        next.name = patch.name;
        next.description = patch.description;
        next.clues = [...patch.clues];
        next.ending = patch.ending;
        next.linkageColors = resolveLinkageColors(patch.linkageColors);
        next.characterSlots = genSlotArray(
          get().mapContext?.gridSize ?? patch.characterSlots.length,
          patch.characterSlots,
        ).map(ensureEntry);
        next.rosterCols = patch.rosterCols;
        next.mark = cloneMark(patch.mark);
        next.toolIcons = cloneToolIcons(patch.toolIcons);
      }),

    // Guarded before `commit` so a rejected removal neither dirties the puzzle
    // nor pushes a no-op entry onto the undo stack.
    removeLinkageColor: (key) => {
      const palette = get().linkageColors;
      if (palette.length <= LINKAGE_COLOR_MIN_COUNT) return;
      const remaining = palette.filter((entry) => entry.key !== key);
      if (remaining.length === palette.length) return;
      commit((next) => {
        const fallback = remaining[0]?.key;
        if (!fallback) return;
        next.characterSlots = retargetLinkageColors(next.characterSlots, key, fallback);
        next.linkageColors = resolveLinkageColors(remaining);
      });
    },

    setParticipantConfig: (slotIndex, patch) => {
      if (slotIndex < 0 || slotIndex >= get().characterSlots.length) return;
      commit((next) => {
        const entry = next.characterSlots[slotIndex];
        if (!entry) return;
        // v0.6.4 §2: a cleared field is stored as absent, like
        // `positionConditions` — the badge then shows the sequence number
        // again instead of an empty chip.
        const displayNumber =
          patch.displayNumber === undefined
            ? entry.displayNumber
            : patch.displayNumber?.trim() || undefined;
        next.characterSlots = next.characterSlots.map((slot, index) =>
          index === slotIndex
            ? {
                characterId: entry.characterId,
                themeColor: patch.themeColor ?? entry.themeColor ?? DEFAULT_THEME_COLOR,
                clue: patch.clue ?? entry.clue ?? '',
                linkages: (patch.linkages ?? entry.linkages ?? []).map((linkage) => ({
                  ...linkage,
                })),
                // FEAT-E01 §7.4: an empty list is stored as "no conditions", so
                // a cleared module leaves no dead array behind in the draft.
                ...(() => {
                  const conditions = patch.positionConditions ?? entry.positionConditions ?? [];
                  return conditions.length > 0
                    ? { positionConditions: conditions.map((c) => ({ ...c })) }
                    : {};
                })(),
                ...(displayNumber ? { displayNumber } : {}),
              }
            : slot,
        );
      });
    },

    /** Puts the character in the first free slot; `null` when the roster is full. */
    assignSlot: (characterId, defaults) => {
      const index = get().characterSlots.findIndex((slot) => slot === null);
      if (index === -1) return null;
      // v0.7.13 §11: 角色的默认值只在加入这一刻读一次。之后改角色、改槽位
      // 互不影响 —— 槽位存的是副本，跟它本来就存 `themeColor` / `displayNumber`
      // 自己的值是一个道理。
      const themeColor = defaults?.themeColor?.trim() || DEFAULT_THEME_COLOR;
      const displayNumber = defaults?.displayNumber?.trim() ?? '';
      commit((next) => {
        next.characterSlots = next.characterSlots.map((slot, i) =>
          i === index
            ? {
                characterId,
                themeColor,
                clue: '',
                linkages: [],
                // 空串不落键：与 `setParticipantConfig` 同一条规矩，
                // 「没有编号展示」= 缺席的字段。
                ...(displayNumber ? { displayNumber } : {}),
              }
            : slot,
        );
      });
      return index;
    },

    // Only touches the roster. Undo restores the slot.
    clearCharacterSlot: (index) => {
      if (!get().characterSlots[index]) return;
      commit((next) => {
        next.characterSlots = next.characterSlots.map((slot, i) => (i === index ? null : slot));
      });
    },

    swapSlots: (from, to) =>
      commit((next) => {
        if (from === to) return;
        const slots = [...next.characterSlots];
        const a = slots[from] ?? null;
        const b = slots[to] ?? null;
        slots[to] = a;
        slots[from] = b;
        next.characterSlots = slots;
      }),

    setSelectedSlot: (selectedSlotIndex) => set({ selectedSlotIndex }),

    // MOD-802: all four actions funnel through the pure reducer so the
    // single-active invariant lives in exactly one place.
    activateParticipantHover: (participantId) =>
      set((state) =>
        reduceLinkageActivation(
          {
            activeParticipantId: state.activeParticipantId,
            activationMode: state.activationMode,
          },
          { type: 'enter', participantId },
        ),
      ),

    deactivateParticipantHover: (participantId) =>
      set((state) =>
        reduceLinkageActivation(
          {
            activeParticipantId: state.activeParticipantId,
            activationMode: state.activationMode,
          },
          { type: 'leave', participantId },
        ),
      ),

    activateParticipantClick: (participantId) =>
      set((state) =>
        reduceLinkageActivation(
          {
            activeParticipantId: state.activeParticipantId,
            activationMode: state.activationMode,
          },
          { type: 'click', participantId },
        ),
      ),

    clearActivation: () => set({ ...INACTIVE_ACTIVATION }),

    setSelection: (selection) => set({ selection }),
    setZoom: (zoom) => set({ zoom }),
    setPan: (pan) => set({ pan }),
    resetView: () => set({ zoom: 1, pan: { x: 0, y: 0 } }),

    /** 与 {@link commit} 同一套历史记账，但写的是 `mapContext`（唯一写它的地方）；换底图后格子坐标含义变了，选择与参与者激活必须一起清掉。 */
    replaceMapContext: (context, characterSlots) => {
      const state = get();
      if (
        state.mapContext &&
        state.mapContext.mapId === context.mapId &&
        state.mapContext.versionNo === context.versionNo &&
        !characterSlots
      ) {
        return;
      }
      const past = [...state.past, snapshot(state)].slice(-MAX_HISTORY_STEPS);
      set({
        mapContext: context,
        ...(characterSlots ? { characterSlots: characterSlots.map(ensureEntry) } : {}),
        selection: null,
        selectedSlotIndex: null,
        ...INACTIVE_ACTIVATION,
        past,
        future: [],
        dirty: true,
      });
    },

    undo: () => {
      const state = get();
      const previous = state.past.at(-1);
      if (!previous) return;
      const past = state.past.slice(0, -1);
      const future = [snapshot(state), ...state.future].slice(0, MAX_HISTORY_STEPS);
      set({ ...previous, past, future, dirty: true });
    },

    redo: () => {
      const state = get();
      const next = state.future[0];
      if (!next) return;
      const future = state.future.slice(1);
      const past = [...state.past, snapshot(state)].slice(-MAX_HISTORY_STEPS);
      set({ ...next, past, future, dirty: true });
    },

    markSaved: (updatedAt) => set({ dirty: false, updatedAt }),

    adoptSavedEntry: (detail) =>
      set({
        puzzleId: detail.id,
        name: detail.data.name,
        description: detail.data.description ?? '',
        clues: [...(detail.data.clues ?? [])],
        ending: detail.data.ending ?? '',
        updatedAt: detail.updatedAt,
        // fork 出来的新行必然是草稿行。
        status: 'draft',
        dirty: false,
      }),

    toDraft: () => {
      const state = get();
      // v0.7.1 §5.3：底图是**副本**，来源信息只用于展示 / 追溯。尺寸的唯一真源
      // 是 `map.data.gridSize`，所以这里必须把整块画布写回去（不是只写三元组）。
      return {
        version: PUZZLE_JSON_VERSION,
        map: {
          mapId: state.mapContext?.mapId ?? 0,
          versionNo: state.mapContext?.versionNo ?? 0,
          mapName: state.mapContext?.mapName ?? '',
          data: {
            version: MAP_JSON_VERSION,
            gridSize: state.mapContext?.gridSize ?? state.characterSlots.length,
            cells: state.mapContext?.cells ?? {},
            regions: state.mapContext?.regions ?? [],
            style: state.mapContext?.style,
          },
        },
        name: state.name,
        description: state.description,
        // 两条都在草稿顶层 —— 与描述同层，因为玩家侧它们本来就被
        // 贴在同一张纸片上（§3）。
        clues: [...state.clues],
        ending: state.ending,
        linkageColors: resolveLinkageColors(state.linkageColors),
        characterSlots: state.characterSlots.map(ensureEntry),
        // v0.6.3 §3: the published game renders the roster the way the puzzle
        // asked for, so the column count has to reach the snapshot.
        rosterCols: state.rosterCols,
        // v0.8.6 §4: 只有作者真的挑过图才写这个键 —— 默认 × 用「缺席」表达，
        // 草稿里不留一个 `mark: null`。
        ...(state.mark
          ? { mark: { ...state.mark } }
          : {}),
        // v0.8.7 §7：同一条规矩 —— 三枚一张都没配就不写这个键。
        ...(state.toolIcons ? { toolIcons: cloneToolIcons(state.toolIcons)! } : {}),
      };
    },

    applyDraft: (draft) =>
      set((state) => {
        const size = state.mapContext?.gridSize ?? draft.characterSlots.length;
        const past = [...state.past, snapshot(state)].slice(-MAX_HISTORY_STEPS);
        return {
          name: draft.name,
          description: draft.description ?? '',
          clues: [...(draft.clues ?? [])],
          ending: draft.ending ?? '',
          linkageColors: resolveLinkageColors(draft.linkageColors),
          characterSlots: genSlotArray(size, draft.characterSlots).map(ensureEntry),
          rosterCols: draft.rosterCols ?? null,
          // v0.8.6 §4：导入 / 恢复草稿时整块读入，同样是副本。
          mark: cloneMark(draft.mark ?? null),
          toolIcons: cloneToolIcons(draft.toolIcons),
          past,
          future: [],
          dirty: true,
          selection: null,
          selectedSlotIndex: null,
          ...INACTIVE_ACTIVATION,
        };
      }),
  };
});
