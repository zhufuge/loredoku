import { create } from 'zustand';
import {
  DEFAULT_THEME_COLOR,
  LINKAGE_COLOR_MIN_COUNT,
  MAP_JSON_VERSION,
  MAX_HISTORY_STEPS,
  PUZZLE_JSON_VERSION,
  type CharacterSlotEntry,
  type DraftCell,
  type DraftRegion,
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
  type LinkageActivationState,
} from '@/lib/linkageActivation';

/**
 * v0.5.0 FEAT-K01 (docs/v0.5.0.md §2.6) — the puzzle editor's store.
 *
 * Why a second store instead of bending `editorStore` to fit: the map editor
 * edits its canvas, while the puzzle only **references** one (read-only). If the
 * two shared a store, every read-only canvas field would become writable by
 * accident. So:
 *
 * - `mapContext` is loaded from `GET /api/puzzles/:id/map`, and the only writer
 *   after that is `replaceMapContext`（引入新地图）—— 它跟着其余字段一起进快照，
 *   撤销能把底图也换回来；
 * - the undo stack covers the puzzle's own data (`linkageColors` /
 *   `characterSlots` / `description` / `name`) **and** the referenced canvas;
 * - `activeTool` is not a thing here — SPEC-K07 pins the canvas to `select`.
 */
export type PuzzleSelection =
  | { type: 'cell'; x: number; y: number }
  | { type: 'region'; regionId: string };

/**
 * v0.7.13 (docs/v0.7.13.md §11): what a character carries into a roster slot.
 *
 * Both fields are nullable and both mean "no default" when null — the slot then
 * falls back to `DEFAULT_THEME_COLOR` / the sequence number, which is exactly
 * the pre-v0.7.13 behaviour for every character created before today.
 */
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
 * Normalises a roster entry so it always carries theme + clue + linkages.
 *
 * BUG-J04 (docs/v0.4.3.md §4.2) moved here verbatim with the roster: this used
 * to copy exactly **four** fields and silently dropped `positionConditions`,
 * which then survived neither `commit` (`snapshot()` runs on every edit), nor
 * `init()` (a page reload), nor `toDraft()` (what reaches the server — so the
 * game page's position check never saw it either). §15 Q11 keeps the fix by
 * declaring every field of `CharacterSlotEntry`.
 *
 * An already-normalised entry is returned **by identity** so the
 * `ParticipantDrawer`'s seeding effect (`[open, slot]`) stops firing — and
 * discarding unsaved local edits — on every unrelated commit.
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
  linkageColors: MapLinkageColor[];
  characterSlots: Array<CharacterSlotEntry | null>;
  /** v0.6.3 (docs/v0.6.3.md §3): `null` = 自动. */
  rosterCols: number | null;
  /**
   * v0.7.3 §4：底图也是可撤销的一部分。
   *
   * 「引入新地图」换的是 `mapContext`，撤销要能把它换回来 —— 否则会出现
   * 「底图是新的、联动是旧的的」这种半截状态。引用级存放，不做深拷贝：它只读。
   */
  mapContext: PuzzleMapContext | null;
}

export interface PuzzleState {
  puzzleId: number | null;
  /** Read-only canvas of the referenced map version. `replaceMapContext` 之外没人写它。 */
  mapContext: PuzzleMapContext | null;

  // ---- puzzle-owned, undoable ----
  name: string;
  description: string;
  linkageColors: MapLinkageColor[];
  characterSlots: Array<CharacterSlotEntry | null>;
  /**
   * v0.6.3 (docs/v0.6.3.md §3): the roster matrix's column count, owned by the
   * puzzle. It rides in the undo stack with the rest of the basics, so
   * 撤销 takes a layout change back too.
   */
  rosterCols: number | null;

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
   * SPEC-K05 (docs/v0.5.0.md §4.2) + v0.6.3 §3 + v0.7.3 §2.2: the 「谜题基本
   * 信息」 drawer commits the name, the description, the palette, the roster
   * **and** its column count as one gesture — one 保存, one undo step.
   *
   * 名称走这里（而不是单独 PATCH）：它本来就在 `PuzzleDraft.name` 里，
   * `savePuzzleDraft` 会把它镜像回 `puzzles.name`，顺带拿到撤销。
   */
  setBasicInfo: (patch: {
    name: string;
    description: string;
    linkageColors: MapLinkageColor[];
    characterSlots: Array<CharacterSlotEntry | null>;
    rosterCols: number | null;
  }) => void;
  setParticipantConfig: (
    slotIndex: number,
    patch: {
      themeColor?: string;
      clue?: string;
      linkages?: ParticipantTarget[];
      positionConditions?: Array<{ x: number; y: number }>;
      /**
       * v0.6.4 (docs/v0.6.4.md §2): the configured 编号展示 text. Omitted =
       * keep what is stored; a blank string clears it back to the sequence
       * number.
       */
      displayNumber?: string | null;
    },
  ) => void;
  /**
   * Puts the character in the first free slot.
   *
   * v0.7.13 (docs/v0.7.13.md §11): `defaults` carries the character's own
   * 主题色 / 编号 (`characters.color` / `characters.displayName`). They are
   * applied **at assignment time only** — later edits to either side never
   * reach across: the slot owns a *copy*, exactly like it already owns a copy
   * of nothing else about the character (its name / avatar are still read from
   * `characters` at render time, on purpose — those are not participant
   * configuration).
   */
  assignSlot: (characterId: number, defaults?: ParticipantDefaults) => number | null;
  clearCharacterSlot: (index: number) => void;
  swapSlots: (from: number, to: number) => void;
  setSelectedSlot: (index: number | null) => void;
  activateParticipantHover: (participantId: number) => void;
  deactivateParticipantHover: (participantId: number) => void;
  activateParticipantClick: (participantId: number) => void;
  clearActivation: () => void;
  setSelection: (selection: PuzzleSelection | null) => void;
  /**
   * v0.7.3 §3.3：引入新地图 —— 只换底图（连同它的名称 / 版本 / 画布），谜题自己
   * 的字段一个不动。一个撤销步，撤销后底图也一起换回来。
   *
   * `characterSlots` 是**同一笔**改动的一部分：换底图时，指向旧画布的联动目标
   * （`asset` / `region`）已经不存在，必须一起摘掉，否则这份草稿再也存不进去
   * （服务端 `assertReferenceIssues` 会 400）。分开提交就会变成两个撤销步。
   */
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
  /**
   * 「保存时才生成草稿」落库之后接管新行：只换身份（id / 名称 / 描述 /
   * `updatedAt` / `status`），画布、撤销栈与视口一个都不动 —— 内容就是刚写进去
   * 的那份，重新 `init` 只会把缩放打回 1×、把历史清空。
   */
  adoptSavedEntry: (detail: PuzzleDetail) => void;
  /** FEAT-K08: the whole draft, ready for save / export. */
  toDraft: () => PuzzleDraft;
  /** FEAT-K08: import / undo — replaces only the puzzle-owned fields. */
  applyDraft: (draft: PuzzleDraft) => void;
}

function snapshot(state: PuzzleState): Snapshot {
  return {
    name: state.name,
    description: state.description,
    linkageColors: state.linkageColors.map((entry) => ({ ...entry })),
    characterSlots: state.characterSlots.map(ensureEntry),
    rosterCols: state.rosterCols,
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
    linkageColors: resolveLinkageColors(undefined),
    characterSlots: [],
    rosterCols: null,
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

    /**
     * FIX-O18 (docs/v0.5.4.md §7.5): `init` used to reset `zoom` / `pan`
     * unconditionally, so any re-seed — including the one a successful save
     * triggers through React Query — threw the board back to the top-left
     * corner. Re-initialising the **same** puzzle keeps the view; switching to
     * another puzzle still starts centred at 1×.
     */
    init: (detail, mapContext) =>
      set((state) => {
        const samePuzzle = state.puzzleId === detail.id;
        return {
        puzzleId: detail.id,
        mapContext,
        name: detail.data.name,
        description: detail.data.description ?? '',
        linkageColors: resolveLinkageColors(detail.data.linkageColors),
        characterSlots: genSlotArray(
          mapContext.gridSize,
          detail.data.characterSlots,
        ).map(ensureEntry),
        rosterCols: detail.data.rosterCols ?? null,
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
        next.linkageColors = resolveLinkageColors(patch.linkageColors);
        next.characterSlots = genSlotArray(
          get().mapContext?.gridSize ?? patch.characterSlots.length,
          patch.characterSlots,
        ).map(ensureEntry);
        next.rosterCols = patch.rosterCols;
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

    /**
     * 与 {@link commit} 同一套历史记账，但换的是 `mapContext`（唯一会写它的地方）。
     *
     * 换底图后格子坐标的含义变了，所以顺带清掉选择与参与者激活 —— 留着它们只会
     * 让信息框 / 高亮描述一块已经不存在的地。
     */
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
        linkageColors: resolveLinkageColors(state.linkageColors),
        characterSlots: state.characterSlots.map(ensureEntry),
        // v0.6.3 §3: the published game renders the roster the way the puzzle
        // asked for, so the column count has to reach the snapshot.
        rosterCols: state.rosterCols,
      };
    },

    applyDraft: (draft) =>
      set((state) => {
        const size = state.mapContext?.gridSize ?? draft.characterSlots.length;
        const past = [...state.past, snapshot(state)].slice(-MAX_HISTORY_STEPS);
        return {
          name: draft.name,
          description: draft.description ?? '',
          linkageColors: resolveLinkageColors(draft.linkageColors),
          characterSlots: genSlotArray(size, draft.characterSlots).map(ensureEntry),
          rosterCols: draft.rosterCols ?? null,
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
