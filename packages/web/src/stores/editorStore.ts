import { create } from 'zustand';
import {
  MAX_HISTORY_STEPS,
  type CardRotation,
  type EditorTool,
  type RegionData,
} from '@murdoku/shared';

export interface EditorCell {
  cardId: number;
  rotation: CardRotation;
  zIndex: number;
}

export type CellKey = `${number},${number}`;

export function cellKey(x: number, y: number): CellKey {
  return `${x},${y}`;
}

interface Snapshot {
  cells: Map<CellKey, EditorCell>;
  regions: RegionData[];
}

export interface EditorState {
  projectId: number | null;
  gridSize: number;
  cells: Map<CellKey, EditorCell>;
  regions: RegionData[];
  activeTool: EditorTool;
  selection: { x: number; y: number } | null;
  zoom: number;
  pan: { x: number; y: number };
  dirty: boolean;
  past: Snapshot[];
  future: Snapshot[];

  init: (projectId: number, gridSize: number) => void;
  setTool: (tool: EditorTool) => void;
  setSelection: (selection: { x: number; y: number } | null) => void;
  placeCard: (x: number, y: number, cardId: number, rotation?: CardRotation, zIndex?: number) => void;
  removeCard: (x: number, y: number) => void;
  moveCard: (fromX: number, fromY: number, toX: number, toY: number) => void;
  createRegion: (region: RegionData) => void;
  updateRegion: (id: number, patch: Partial<Omit<RegionData, 'id'>>) => void;
  deleteRegion: (id: number) => void;
  undo: () => void;
  redo: () => void;
  markSaved: () => void;
}

function snapshot(state: EditorState): Snapshot {
  return {
    cells: new Map(state.cells),
    regions: state.regions.map((region) => ({ ...region, cells: [...region.cells] })),
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
    gridSize: 20,
    cells: new Map(),
    regions: [],
    activeTool: 'select',
    selection: null,
    zoom: 1,
    pan: { x: 0, y: 0 },
    dirty: false,
    past: [],
    future: [],

    init: (projectId, gridSize) =>
      set({
        projectId,
        gridSize,
        cells: new Map(),
        regions: [],
        activeTool: 'select',
        selection: null,
        zoom: 1,
        pan: { x: 0, y: 0 },
        dirty: false,
        past: [],
        future: [],
      }),

    setTool: (activeTool) => set({ activeTool }),
    setSelection: (selection) => set({ selection }),

    placeCard: (x, y, cardId, rotation = 0, zIndex = 0) =>
      commit((next) => {
        next.cells.set(cellKey(x, y), { cardId, rotation, zIndex });
      }),

    removeCard: (x, y) =>
      commit((next) => {
        next.cells.delete(cellKey(x, y));
      }),

    moveCard: (fromX, fromY, toX, toY) =>
      commit((next) => {
        const from = next.cells.get(cellKey(fromX, fromY));
        if (!from) return;
        const target = next.cells.get(cellKey(toX, toY));
        next.cells.set(cellKey(toX, toY), from);
        if (target) {
          next.cells.set(cellKey(fromX, fromY), target);
        } else {
          next.cells.delete(cellKey(fromX, fromY));
        }
      }),

    createRegion: (region) =>
      commit((next) => {
        next.regions = [...next.regions, region];
      }),

    updateRegion: (id, patch) =>
      commit((next) => {
        next.regions = next.regions.map((region) =>
          region.id === id ? { ...region, ...patch } : region,
        );
      }),

    deleteRegion: (id) =>
      commit((next) => {
        next.regions = next.regions.filter((region) => region.id !== id);
      }),

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

    markSaved: () => set({ dirty: false }),
  };
});
