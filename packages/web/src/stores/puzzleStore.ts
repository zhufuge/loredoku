import { create } from 'zustand';
import {
  DEFAULT_THEME_COLOR,
  LINKAGE_COLOR_MIN_COUNT,
  MAX_HISTORY_STEPS,
  PUZZLE_JSON_VERSION,
  type CharacterSlotEntry,
  type DraftCell,
  type DraftRegion,
  type MapLinkageColor,
  type MapStyle,
  type ParticipantTarget,
  type ProjectStatus,
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
 * - `mapContext` is loaded from `GET /api/puzzles/:id/map` and **never** enters
 *   the undo stack;
 * - the undo stack covers exactly the puzzle's own data (`linkageColors` /
 *   `characterSlots` / `description`);
 * - `activeTool` is not a thing here — SPEC-K07 pins the canvas to `select`.
 */
export type PuzzleSelection =
  | { type: 'cell'; x: number; y: number }
  | { type: 'region'; regionId: string };

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
  };
}

/** The undoable half of the state. */
interface Snapshot {
  name: string;
  description: string;
  linkageColors: MapLinkageColor[];
  characterSlots: Array<CharacterSlotEntry | null>;
}

export interface PuzzleState {
  puzzleId: number | null;
  /** Read-only canvas of the referenced map version. Never in the undo stack. */
  mapContext: PuzzleMapContext | null;

  // ---- puzzle-owned, undoable ----
  name: string;
  description: string;
  linkageColors: MapLinkageColor[];
  characterSlots: Array<CharacterSlotEntry | null>;

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
  status: ProjectStatus;
  past: Snapshot[];
  future: Snapshot[];

  /** Seeds everything from the puzzle detail + its read-only canvas. */
  init: (detail: PuzzleDetail, mapContext: PuzzleMapContext) => void;
  setDescription: (text: string) => void;
  setLinkageColors: (colors: MapLinkageColor[]) => void;
  removeLinkageColor: (key: string) => void;
  /**
   * SPEC-K05 (docs/v0.5.0.md §4.2): the 「谜题基本信息」 drawer commits the
   * description, the palette **and** the re-pointed roster as one gesture —
   * one 保存, one undo step.
   */
  setBasicInfo: (patch: {
    description: string;
    linkageColors: MapLinkageColor[];
    characterSlots: Array<CharacterSlotEntry | null>;
  }) => void;
  setParticipantConfig: (
    slotIndex: number,
    patch: {
      themeColor?: string;
      clue?: string;
      linkages?: ParticipantTarget[];
      positionConditions?: Array<{ x: number; y: number }>;
    },
  ) => void;
  assignSlot: (characterId: number) => number | null;
  clearCharacterSlot: (index: number) => void;
  swapSlots: (from: number, to: number) => void;
  setSelectedSlot: (index: number | null) => void;
  activateParticipantHover: (participantId: number) => void;
  deactivateParticipantHover: (participantId: number) => void;
  activateParticipantClick: (participantId: number) => void;
  clearActivation: () => void;
  setSelection: (selection: PuzzleSelection | null) => void;
  setZoom: (zoom: number) => void;
  setPan: (pan: { x: number; y: number }) => void;
  resetView: () => void;
  undo: () => void;
  redo: () => void;
  markSaved: (updatedAt: string) => void;
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

    init: (detail, mapContext) =>
      set({
        puzzleId: detail.id,
        mapContext,
        name: detail.data.name,
        description: detail.data.description ?? '',
        linkageColors: resolveLinkageColors(detail.data.linkageColors),
        characterSlots: genSlotArray(
          mapContext.gridSize,
          detail.data.characterSlots,
        ).map(ensureEntry),
        selection: null,
        selectedSlotIndex: null,
        ...INACTIVE_ACTIVATION,
        zoom: 1,
        pan: { x: 0, y: 0 },
        dirty: false,
        updatedAt: detail.updatedAt,
        status: detail.status,
        past: [],
        future: [],
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
        next.description = patch.description;
        next.linkageColors = resolveLinkageColors(patch.linkageColors);
        next.characterSlots = genSlotArray(
          get().mapContext?.gridSize ?? patch.characterSlots.length,
          patch.characterSlots,
        ).map(ensureEntry);
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
              }
            : slot,
        );
      });
    },

    /** Puts the character in the first free slot; `null` when the roster is full. */
    assignSlot: (characterId) => {
      const index = get().characterSlots.findIndex((slot) => slot === null);
      if (index === -1) return null;
      commit((next) => {
        next.characterSlots = next.characterSlots.map((slot, i) =>
          i === index ? { characterId, themeColor: DEFAULT_THEME_COLOR, clue: '', linkages: [] } : slot,
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

    toDraft: () => {
      const state = get();
      // §2.4 / §5.1: the map triplet is a **reference**, never a copy. The
      // server forces it back to the stored values anyway.
      return {
        version: PUZZLE_JSON_VERSION,
        map: {
          projectId: state.mapContext?.projectId ?? 0,
          versionNo: state.mapContext?.versionNo ?? 0,
          gridSize: state.mapContext?.gridSize ?? state.characterSlots.length,
        },
        name: state.name,
        description: state.description,
        linkageColors: resolveLinkageColors(state.linkageColors),
        characterSlots: state.characterSlots.map(ensureEntry),
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
