import { create } from 'zustand';
import {
  DEFAULT_THEME_COLOR,
  GRID_SIZE_DEFAULT,
  LINKAGE_COLOR_MIN_COUNT,
  MAP_JSON_VERSION,
  MAX_HISTORY_STEPS,
  type CharacterSlotEntry,
  type DraftCell,
  type DraftRegion,
  type EditorLayer,
  type EditorTool,
  type MapDraft,
  type MapLinkageColor,
  type MapStyle,
  type ParticipantTarget,
} from '@loredoku/shared';
import { computeLabelCell, coordKey } from '@/lib/region';
import { isEmptyCell, objectFootprintKeys, resolveEraseTarget } from '@/lib/erase';
import { resolveMapStyle, retargetLinkageColors } from '@/lib/mapStyle';
import {
  INACTIVE_ACTIVATION,
  reduceLinkageActivation,
  type ActivationMode,
  type LinkageActivationState,
} from '@/lib/linkageActivation';

export type CellKey = `${number},${number}`;

export function cellKey(x: number, y: number): CellKey {
  return `${x},${y}`;
}

export function genRegionId(): string {
  return `rg_${Math.random().toString(16).slice(2, 10)}`;
}

/**
 * Builds a roster sized to `size`. CLAR-603: the roster length tracks
 * `gridSize`. Existing entries are preserved; defaults to `null`.
 */
export function genSlotArray(
  size: number,
  existing: Array<CharacterSlotEntry | null> = [],
): Array<CharacterSlotEntry | null> {
  return Array.from({ length: size }, (_, index) => existing[index] ?? null);
}

/**
 * Normalises a roster entry so it always carries theme + clue + linkages.
 *
 * BUG-J04 (docs/v0.4.3.md §4.2): this used to copy exactly **four** fields and
 * silently dropped `positionConditions`. The list then survived neither a
 * `commit` (`snapshot()` runs on every edit), nor `init()` (a page reload), nor
 * `toDraft()` (what actually reaches the server — so the game page's position
 * check never saw it either). Every field of `CharacterSlotEntry` must ride
 * through here.
 *
 * §9 Q7: an entry that is already normalised is returned **by identity**, so the
 * `ParticipantDrawer`'s seeding effect (`[open, slot]`) stops firing — and
 * discarding unsaved local edits — on every unrelated commit. Callers only ever
 * *replace* slot objects, never mutate them in place, so sharing the reference
 * stays safe.
 */
function ensureEntry(entry: CharacterSlotEntry | null): CharacterSlotEntry | null {
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

export interface EditorMeta {
  updatedAt: string | null;
  currentVersionNo: number | null;
  status: 'draft' | 'published';
}

export interface RegionInput {
  id: string;
  name: string;
  color: string;
  borderWidth: number;
  fillOpacity: number;
  cells: Array<[number, number]>;
}

export type ConflictMode = 'override' | 'skip';

/**
 * CLAR-603: the only selection types are `cell` and `region`. Characters no
 * longer occupy cells, so clicking a roster slot opens the participant
 * drawer rather than producing a canvas selection.
 */
export type Selection =
  | { type: 'cell'; x: number; y: number }
  | { type: 'region'; regionId: string };

interface Snapshot {
  gridSize: number;
  cells: Map<CellKey, DraftCell>;
  regions: DraftRegion[];
  characterSlots: Array<CharacterSlotEntry | null>;
  /** v0.3.8 FEAT-D02: style edits are undoable like any other change. */
  style: MapStyle;
}

export interface EditorState {
  projectId: number | null;
  gridSize: number;
  cells: Map<CellKey, DraftCell>;
  regions: DraftRegion[];
  characterSlots: Array<CharacterSlotEntry | null>;
  /** v0.3.8 FEAT-D02: map-level display constants (always fully resolved). */
  style: MapStyle;
  activeTool: EditorTool;
  activeLayer: EditorLayer;
  selection: Selection | null;
  selectedRegionId: string | null;
  selectedItemId: number | null;
  /** Slot index selected in the participant panel (drives the right drawer). */
  selectedSlotIndex: number | null;
  /**
   * MOD-802: single-active linkage preview. `activeParticipantId` is the
   * slot index whose linkages are highlighted; `activationMode` records
   * whether hover or click triggered it.
   */
  activeParticipantId: number | null;
  activationMode: ActivationMode | null;
  regionDraftSelection: Set<string>;
  zoom: number;
  pan: { x: number; y: number };
  dirty: boolean;
  updatedAt: string | null;
  currentVersionNo: number | null;
  status: 'draft' | 'published';
  past: Snapshot[];
  future: Snapshot[];

  init: (projectId: number, draft: MapDraft, meta: EditorMeta) => void;
  setTool: (tool: EditorTool) => void;
  setLayer: (layer: EditorLayer) => void;
  setSelection: (selection: Selection | null) => void;
  setSelectedRegion: (id: string | null) => void;
  setSelectedItem: (id: number | null) => void;
  setSelectedSlot: (index: number | null) => void;

  /** MOD-802: pointer entered a slot → hover-activate (auto-ends previous). */
  activateParticipantHover: (participantId: number) => void;
  /** MOD-802: pointer left a slot → hover-deactivate (no-op when click-active). */
  deactivateParticipantHover: (participantId: number) => void;
  /** MOD-802: click a slot → toggle click-activation. */
  activateParticipantClick: (participantId: number) => void;
  /** MOD-802: Esc → force-clear the active linkage. */
  clearActivation: () => void;

  toggleDraftCell: (x: number, y: number) => void;
  addDraftCells: (cells: Array<[number, number]>) => void;
  removeDraftCells: (cells: Array<[number, number]>) => void;
  clearDraftSelection: () => void;

  placeBackground: (itemId: number, x: number, y: number) => void;
  placeObject: (
    item: { id: number; widthCells: number; heightCells: number },
    x: number,
    y: number,
  ) => void;
  eraseAt: (x: number, y: number) => void;
  clearCell: (x: number, y: number) => void;
  clearObjectAt: (x: number, y: number) => void;
  /** CLAR-603 + MOD-801 + FEAT-E01: persists theme + clue + linkages + conditions. */
  setParticipantConfig: (
    slotIndex: number,
    patch: {
      themeColor?: string;
      clue?: string;
      linkages?: ParticipantTarget[];
      positionConditions?: Array<{ x: number; y: number }>;
    },
  ) => void;

  createRegion: (input: RegionInput, mode: ConflictMode) => string;
  toggleRegionCell: (id: string, x: number, y: number) => void;
  updateRegion: (regionId: string, input: RegionInput) => void;
  deleteRegion: (id: string) => void;

  setSlot: (index: number, characterId: number | null) => void;
  clearCharacterSlot: (index: number) => void;
  swapSlots: (from: number, to: number) => void;

  setGridSize: (size: number) => void;
  applyDraft: (draft: MapDraft) => void;
  /**
   * v0.3.8 FEAT-D02: composes the whole 「地图基本信息」drawer. The updater
   * receives the resolved style and returns the next one; the change lands in
   * the undo stack as a single step.
   */
  setMapStyle: (updater: (style: MapStyle) => MapStyle) => void;
  /** FEAT-D03: `null` restores the adaptive cell size. */
  setCellSizeOverride: (value: number | null) => void;
  /** FEAT-D04: removes a palette entry and re-points every reference to it. */
  removeLinkageColor: (key: string) => void;
  setLinkageColors: (colors: MapLinkageColor[]) => void;
  setZoom: (zoom: number) => void;
  setPan: (pan: { x: number; y: number }) => void;
  resetView: () => void;

  undo: () => void;
  redo: () => void;
  markSaved: (updatedAt: string) => void;
  setVersionInfo: (info: { currentVersionNo: number | null; status: 'draft' | 'published' }) => void;
  toDraft: () => MapDraft;
}

function snapshot(state: EditorState): Snapshot {
  return {
    gridSize: state.gridSize,
    cells: new Map(state.cells),
    regions: state.regions.map((region) => ({ ...region, cells: [...region.cells] })),
    characterSlots: state.characterSlots.map(ensureEntry),
    style: state.style,
  };
}

export const useEditorStore = create<EditorState>((set, get) => {
  function commit(mutate: (next: Snapshot) => void): void {
    const state = get();
    const next = snapshot(state);
    mutate(next);
    const past = [...state.past, snapshot(state)].slice(-MAX_HISTORY_STEPS);
    set({ ...next, past, future: [], dirty: true });
  }

  return {
    projectId: null,
    gridSize: GRID_SIZE_DEFAULT,
    cells: new Map(),
    regions: [],
    characterSlots: genSlotArray(GRID_SIZE_DEFAULT),
    style: resolveMapStyle(undefined),
    activeTool: 'select',
    activeLayer: 'background',
    selection: null,
    selectedRegionId: null,
    selectedItemId: null,
    selectedSlotIndex: null,
    activeParticipantId: null,
    activationMode: null,
    regionDraftSelection: new Set<string>(),
    zoom: 1,
    pan: { x: 0, y: 0 },
    dirty: false,
    updatedAt: null,
    currentVersionNo: null,
    status: 'draft',
    past: [],
    future: [],

    init: (projectId, draft, meta) => {
      const cells = new Map<CellKey, DraftCell>();
      for (const key of Object.keys(draft.cells)) {
        const cell = draft.cells[key];
        if (cell) cells.set(key as CellKey, cell);
      }
      const slots = genSlotArray(draft.gridSize, draft.characterSlots).map(ensureEntry);
      set({
        projectId,
        gridSize: draft.gridSize,
        cells,
        regions: draft.regions,
        characterSlots: slots,
        style: resolveMapStyle(draft.style),
        activeTool: 'select',
        activeLayer: 'background',
        selection: null,
        selectedRegionId: null,
        selectedItemId: null,
        selectedSlotIndex: null,
        ...INACTIVE_ACTIVATION,
        regionDraftSelection: new Set<string>(),
        zoom: 1,
        pan: { x: 0, y: 0 },
        dirty: false,
        updatedAt: meta.updatedAt,
        currentVersionNo: meta.currentVersionNo,
        status: meta.status,
        past: [],
        future: [],
      });
    },

    setTool: (activeTool) =>
      activeTool === 'region'
        ? set({ activeTool })
        : set({ activeTool, regionDraftSelection: new Set<string>() }),
    setLayer: (activeLayer) => set({ activeLayer }),
    setSelection: (selection) => set({ selection }),
    setSelectedRegion: (selectedRegionId) => set({ selectedRegionId }),
    setSelectedItem: (selectedItemId) => set({ selectedItemId }),
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

    toggleDraftCell: (x, y) =>
      set((state) => {
        const key = coordKey(x, y);
        const next = new Set(state.regionDraftSelection);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return { regionDraftSelection: next };
      }),

    addDraftCells: (cells) =>
      set((state) => {
        const next = new Set(state.regionDraftSelection);
        for (const [x, y] of cells) next.add(coordKey(x, y));
        return { regionDraftSelection: next };
      }),

    removeDraftCells: (cells) =>
      set((state) => {
        const next = new Set(state.regionDraftSelection);
        for (const [x, y] of cells) next.delete(coordKey(x, y));
        return { regionDraftSelection: next };
      }),

    clearDraftSelection: () => set({ regionDraftSelection: new Set<string>() }),

    placeBackground: (itemId, x, y) =>
      commit((next) => {
        const key = cellKey(x, y);
        const cell: DraftCell = { ...(next.cells.get(key) ?? {}), background: { itemId } };
        next.cells.set(key, cell);
      }),

    placeObject: (item, x, y) =>
      commit((next) => {
        for (let dy = 0; dy < item.heightCells; dy += 1) {
          for (let dx = 0; dx < item.widthCells; dx += 1) {
            const key = cellKey(x + dx, y + dy);
            const cell: DraftCell = { ...(next.cells.get(key) ?? {}) };
            delete cell.object;
            if (dx === 0 && dy === 0) {
              cell.object = { itemId: item.id, w: item.widthCells, h: item.heightCells };
            }
            next.cells.set(key, cell);
          }
        }
      }),

    // Eraser order: object layer → background layer (CLAR-603: no character layer).
    eraseAt: (x, y) => {
      const state = get();
      const target = resolveEraseTarget(state.cells, x, y);
      if (!target) return;
      const targetKey = target.key as CellKey;
      commit((next) => {
        if (target.layer === 'object') {
          const anchor = next.cells.get(targetKey)?.object;
          const keys = anchor
            ? objectFootprintKeys(anchor, target.x, target.y)
            : [target.key];
          for (const rawKey of keys) {
            const key = rawKey as CellKey;
            const cell = next.cells.get(key);
            if (!cell) continue;
            const copy = { ...cell };
            delete copy.object;
            if (isEmptyCell(copy)) next.cells.delete(key);
            else next.cells.set(key, copy);
          }
          return;
        }
        const cell = next.cells.get(targetKey);
        if (!cell) return;
        const copy = { ...cell };
        delete copy.background;
        if (isEmptyCell(copy)) next.cells.delete(targetKey);
        else next.cells.set(targetKey, copy);
      });
    },

    clearCell: (x, y) =>
      commit((next) => {
        next.cells.delete(cellKey(x, y));
      }),

    clearObjectAt: (x, y) =>
      commit((next) => {
        const key = cellKey(x, y);
        const cell = next.cells.get(key);
        if (!cell) return;
        const copy = { ...cell };
        delete copy.object;
        if (isEmptyCell(copy)) next.cells.delete(key);
        else next.cells.set(key, copy);
      }),

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

    createRegion: (input, mode) => {
      const id = input.id || genRegionId();
      commit((next) => {
        const keys = new Set(input.cells.map(([x, y]) => coordKey(x, y)));
        let regions = next.regions;
        if (mode === 'override') {
          regions = regions
            .map((region) => ({
              ...region,
              cells: region.cells.filter(([x, y]) => !keys.has(coordKey(x, y))),
            }))
            .filter((region) => region.cells.length > 0);
        }
        let cells = input.cells;
        if (mode === 'skip') {
          const owned = new Set<string>();
          for (const region of regions) {
            for (const [x, y] of region.cells) owned.add(coordKey(x, y));
          }
          cells = input.cells.filter(([x, y]) => !owned.has(coordKey(x, y)));
        }
        next.regions =
          cells.length === 0
            ? regions
            : [
                ...regions,
                {
                  id,
                  name: input.name,
                  color: input.color,
                  borderWidth: input.borderWidth,
                  fillOpacity: input.fillOpacity,
                  cells: [...cells],
                  labelCell: computeLabelCell(cells),
                },
              ];
      });
      set({ selectedRegionId: id });
      return id;
    },

    toggleRegionCell: (id, x, y) =>
      commit((next) => {
        const key = coordKey(x, y);
        next.regions = next.regions.map((region) => {
          if (region.id !== id) return region;
          const exists = region.cells.some(([cx, cy]) => coordKey(cx, cy) === key);
          const cells: Array<[number, number]> = exists
            ? region.cells.filter(([cx, cy]) => coordKey(cx, cy) !== key)
            : [...region.cells, [x, y]];
          return { ...region, cells, labelCell: computeLabelCell(cells) };
        });
      }),

    updateRegion: (regionId, input) =>
      commit((next) => {
        next.regions = next.regions.map((region) =>
          region.id === regionId
            ? {
                id: input.id || region.id,
                name: input.name,
                color: input.color,
                borderWidth: input.borderWidth,
                fillOpacity: input.fillOpacity,
                cells: [...input.cells],
                labelCell: computeLabelCell(input.cells),
              }
            : region,
        );
      }),

    deleteRegion: (id) => {
      commit((next) => {
        next.regions = next.regions.filter((region) => region.id !== id);
      });
      if (get().selectedRegionId === id) set({ selectedRegionId: null });
    },

    setSlot: (index, characterId) =>
      commit((next) => {
        next.characterSlots = next.characterSlots.map((slot, i) =>
          i === index
            ? characterId
              ? {
                  characterId,
                  themeColor: slot?.themeColor ?? DEFAULT_THEME_COLOR,
                  clue: slot?.clue ?? '',
                  linkages: (slot?.linkages ?? []).map((linkage) => ({ ...linkage })),
                  // v0.4.3 §9 Q8: position conditions belong to the *character*
                  // that was there before, so assigning a new one starts clean.
                }
              : null
            : slot,
        );
      }),

    // Only touches the roster, never map data. Undo restores the slot.
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

    setGridSize: (size) =>
      commit((next) => {
        const inBounds = (x: number, y: number): boolean =>
          x >= 0 && y >= 0 && x < size && y < size;
        for (const key of [...next.cells.keys()]) {
          const [x, y] = key.split(',').map(Number) as [number, number];
          if (!inBounds(x, y)) next.cells.delete(key);
        }
        next.regions = next.regions
          .map((region) => {
            const cells = region.cells.filter(([x, y]) => inBounds(x, y));
            return { ...region, cells, labelCell: computeLabelCell(cells) };
          })
          .filter((region) => region.cells.length > 0);
        next.characterSlots = genSlotArray(size, next.characterSlots).map(ensureEntry);
        next.gridSize = size;
      }),

    applyDraft: (draft) =>
      set((state) => {
        const cells = new Map<CellKey, DraftCell>();
        for (const key of Object.keys(draft.cells)) {
          const cell = draft.cells[key];
          if (cell) cells.set(key as CellKey, cell);
        }
        const past = [...state.past, snapshot(state)].slice(-MAX_HISTORY_STEPS);
        return {
          gridSize: draft.gridSize,
          cells,
          regions: draft.regions,
          characterSlots: genSlotArray(draft.gridSize, draft.characterSlots).map(ensureEntry),
          style: resolveMapStyle(draft.style),
          past,
          future: [],
          dirty: true,
          selection: null,
          selectedRegionId: null,
          selectedSlotIndex: null,
          ...INACTIVE_ACTIVATION,
          regionDraftSelection: new Set<string>(),
        };
      }),

    /**
     * v0.3.8 FEAT-D02 §关键规则 4 + v0.3.9: the map style is committed in one
     * step. 区域轮廓线（Region Outline）is a map-level style, so writing its
     * width also mirrors it onto every existing region's own `borderWidth` —
     * same undo step, so Ctrl+Z reverts both together.
     */
    setMapStyle: (updater) =>
      commit((next) => {
        const previousWidth = next.style.regionOutline.width;
        next.style = resolveMapStyle(updater(next.style));
        if (next.style.regionOutline.width !== previousWidth) {
          const width = next.style.regionOutline.width;
          next.regions = next.regions.map((region) => ({ ...region, borderWidth: width }));
        }
      }),

    setCellSizeOverride: (value) =>
      commit((next) => {
        next.style = resolveMapStyle({ ...next.style, cellSize: value });
      }),

    setLinkageColors: (colors) =>
      commit((next) => {
        next.style = resolveMapStyle({ ...next.style, linkageColors: colors });
      }),

    // Guarded before `commit` so a rejected removal neither dirties the map
    // nor pushes a no-op entry onto the undo stack.
    removeLinkageColor: (key) => {
      const palette = get().style.linkageColors;
      if (palette.length <= LINKAGE_COLOR_MIN_COUNT) return;
      const remaining = palette.filter((entry) => entry.key !== key);
      if (remaining.length === palette.length) return;
      commit((next) => {
        const fallback = remaining[0]?.key;
        if (!fallback) return;
        next.characterSlots = retargetLinkageColors(next.characterSlots, key, fallback);
        next.style = resolveMapStyle({ ...next.style, linkageColors: remaining });
      });
    },

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
    setVersionInfo: ({ currentVersionNo, status }) => set({ currentVersionNo, status }),

    toDraft: () => {
      const state = get();
      const cells: Record<string, DraftCell> = {};
      for (const [key, cell] of state.cells.entries()) {
        cells[key] = cell;
      }
      return {
        version: MAP_JSON_VERSION,
        gridSize: state.gridSize,
        cells,
        regions: state.regions,
        characterSlots: state.characterSlots.map(ensureEntry),
        style: state.style,
      };
    },
  };
});
