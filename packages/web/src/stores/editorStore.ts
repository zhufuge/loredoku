import { create } from 'zustand';
import {
  DEFAULT_THEME_COLOR,
  GRID_SIZE_DEFAULT,
  MAP_JSON_VERSION,
  MAX_HISTORY_STEPS,
  type CharacterSlot,
  type DraftCell,
  type DraftRegion,
  type EditorLayer,
  type EditorTool,
  type MapDraft,
  type ParticipantTrigger,
  type PlacedCharacter,
} from '@murdoku/shared';
import { computeLabelCell, coordKey } from '@/lib/region';
import { isEmptyCell, objectFootprintKeys, resolveEraseTarget } from '@/lib/erase';

export type CellKey = `${number},${number}`;

export function cellKey(x: number, y: number): CellKey {
  return `${x},${y}`;
}

export function genRegionId(): string {
  return `rg_${Math.random().toString(16).slice(2, 10)}`;
}

export function genSlotArray(size: number, existing: Array<CharacterSlot | null> = []): Array<CharacterSlot | null> {
  return Array.from({ length: size }, (_, index) => existing[index] ?? null);
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

export type Selection =
  | { type: 'cell'; x: number; y: number }
  | { type: 'region'; regionId: string }
  | { type: 'character'; characterId: number; x: number; y: number };

interface Snapshot {
  gridSize: number;
  cells: Map<CellKey, DraftCell>;
  regions: DraftRegion[];
  characterSlots: Array<CharacterSlot | null>;
  placedCharacters: PlacedCharacter[];
}

export interface EditorState {
  projectId: number | null;
  gridSize: number;
  cells: Map<CellKey, DraftCell>;
  regions: DraftRegion[];
  characterSlots: Array<CharacterSlot | null>;
  placedCharacters: PlacedCharacter[];
  activeTool: EditorTool;
  activeLayer: EditorLayer;
  selection: Selection | null;
  selectedRegionId: string | null;
  selectedItemId: number | null;
  selectedCharacterId: number | null;
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
  setSelectedCharacter: (id: number | null) => void;

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
  placeCharacter: (characterId: number, x: number, y: number, preferredSlotIndex?: number) => void;
  eraseAt: (x: number, y: number) => void;
  clearCell: (x: number, y: number) => void;
  clearObjectAt: (x: number, y: number) => void;
  removeCharacterAt: (x: number, y: number) => void;
  setPlacedMeta: (x: number, y: number, mapMeta: Record<string, unknown>) => void;
  /** FEAT-502: theme colour + triggers saved as one atomic history step. */
  setParticipantConfig: (
    characterId: number,
    patch: { themeColor?: string; triggers?: ParticipantTrigger[] },
  ) => void;

  createRegion: (input: RegionInput, mode: ConflictMode) => string;
  toggleRegionCell: (id: string, x: number, y: number) => void;
  updateRegion: (regionId: string, input: RegionInput) => void;
  deleteRegion: (id: string) => void;

  setSlot: (index: number, characterId: number | null) => void;
  clearCharacterSlot: (index: number) => void;
  swapSlots: (from: number, to: number) => void;
  returnCharacterToSlot: (characterId: number) => boolean;

  setGridSize: (size: number) => void;
  applyDraft: (draft: MapDraft) => void;
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
    characterSlots: [...state.characterSlots],
    placedCharacters: state.placedCharacters.map((placed) => ({
      ...placed,
      mapMeta: { ...placed.mapMeta },
      // Triggers are edited in the dialog; copy them so undo keeps the old list.
      triggers: (placed.triggers ?? []).map((trigger) => ({
        trigger: trigger.trigger,
        targets: trigger.targets.map((target) => ({ ...target })),
      })),
    })),
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
    placedCharacters: [],
    activeTool: 'select',
    activeLayer: 'background',
    selection: null,
    selectedRegionId: null,
    selectedItemId: null,
    selectedCharacterId: null,
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
      const slots = genSlotArray(draft.gridSize, draft.characterSlots);
      set({
        projectId,
        gridSize: draft.gridSize,
        cells,
        regions: draft.regions,
        characterSlots: slots,
        placedCharacters: draft.placedCharacters,
        activeTool: 'select',
        activeLayer: 'background',
        selection: null,
        selectedRegionId: null,
        selectedItemId: null,
        selectedCharacterId: null,
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
    setSelectedCharacter: (selectedCharacterId) => set({ selectedCharacterId }),

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

    // Atomic: frees the roster slot and adds the placement in one history step.
    placeCharacter: (characterId, x, y, preferredSlotIndex) =>
      commit((next) => {
        const preferred =
          preferredSlotIndex !== undefined &&
          preferredSlotIndex >= 0 &&
          preferredSlotIndex < next.characterSlots.length &&
          next.characterSlots[preferredSlotIndex]?.characterId === characterId
            ? preferredSlotIndex
            : -1;
        const originSlotIndex =
          preferred !== -1
            ? preferred
            : next.characterSlots.findIndex((slot) => slot?.characterId === characterId);
        if (originSlotIndex !== -1) {
          next.characterSlots = next.characterSlots.map((slot, index) =>
            index === originSlotIndex ? null : slot,
          );
        }
        next.placedCharacters = [
          ...next.placedCharacters.filter(
            (placed) => placed.characterId !== characterId && !(placed.x === x && placed.y === y),
          ),
          {
            characterId,
            x,
            y,
            mapMeta: {},
            originSlotIndex: originSlotIndex === -1 ? undefined : originSlotIndex,
            themeColor: DEFAULT_THEME_COLOR,
            triggers: [],
          },
        ];
      }),

    removeCharacterAt: (x, y) =>
      commit((next) => {
        next.placedCharacters = next.placedCharacters.filter(
          (placed) => !(placed.x === x && placed.y === y),
        );
      }),

    // Eraser order: characters → object layer → background layer (visual top-down).
    // `activeLayer` is intentionally ignored, see docs/v0.2.5.md BUG-406.
    eraseAt: (x, y) => {
      const state = get();
      const target = resolveEraseTarget(state.cells, state.placedCharacters, x, y);
      if (!target) return;
      const targetKey = target.key as CellKey;
      commit((next) => {
        if (target.layer === 'character') {
          next.placedCharacters = next.placedCharacters.filter(
            (placed) => !(placed.x === target.x && placed.y === target.y),
          );
          return;
        }
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
        next.placedCharacters = next.placedCharacters.filter(
          (placed) => !(placed.x === x && placed.y === y),
        );
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

    setPlacedMeta: (x, y, mapMeta) =>
      commit((next) => {
        next.placedCharacters = next.placedCharacters.map((placed) =>
          placed.x === x && placed.y === y ? { ...placed, mapMeta } : placed,
        );
      }),

    setParticipantConfig: (characterId, patch) =>
      commit((next) => {
        next.placedCharacters = next.placedCharacters.map((placed) =>
          placed.characterId === characterId
            ? {
                ...placed,
                ...(patch.themeColor !== undefined ? { themeColor: patch.themeColor } : {}),
                ...(patch.triggers !== undefined ? { triggers: patch.triggers } : {}),
              }
            : placed,
        );
      }),

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
          i === index ? (characterId ? { characterId } : null) : slot,
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

    returnCharacterToSlot: (characterId) => {
      const state = get();
      const placed = state.placedCharacters.find((item) => item.characterId === characterId);
      if (!placed) return false;
      const slots = [...state.characterSlots];
      const alreadySlotted = slots.some((slot) => slot?.characterId === characterId);
      let target = -1;
      if (!alreadySlotted) {
        const origin = placed.originSlotIndex ?? -1;
        if (origin >= 0 && origin < slots.length && slots[origin] === null) {
          target = origin;
        } else {
          target = slots.findIndex((slot) => slot === null);
        }
        if (target === -1) return false;
      }
      commit((next) => {
        if (target !== -1) {
          next.characterSlots = next.characterSlots.map((slot, index) =>
            index === target ? { characterId } : slot,
          );
        }
        next.placedCharacters = next.placedCharacters.filter(
          (item) => item.characterId !== characterId,
        );
      });
      return true;
    },

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
        next.placedCharacters = next.placedCharacters.filter((placed) =>
          inBounds(placed.x, placed.y),
        );
        next.characterSlots = genSlotArray(size, next.characterSlots);
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
          characterSlots: genSlotArray(draft.gridSize, draft.characterSlots),
          placedCharacters: draft.placedCharacters,
          past,
          future: [],
          dirty: true,
          selection: null,
          selectedRegionId: null,
          regionDraftSelection: new Set<string>(),
        };
      }),

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
        characterSlots: state.characterSlots,
        placedCharacters: state.placedCharacters,
      };
    },
  };
});
