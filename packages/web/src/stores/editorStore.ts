import { create } from 'zustand';
import {
  GRID_SIZE_DEFAULT,
  MAP_JSON_VERSION,
  MAX_HISTORY_STEPS,
  type DraftCell,
  type DraftRegion,
  type EditorLayer,
  type EditorTool,
  type MapDraft,
  type MapStyle,
} from '@loredoku/shared';
import { computeLabelCell, coordKey } from '@/lib/region';
import { isEmptyCell, itemFootprintKeys, resolveEraseTarget } from '@/lib/erase';
import { resolveMapStyle } from '@/lib/mapStyle';

export type CellKey = `${number},${number}`;

export function cellKey(x: number, y: number): CellKey {
  return `${x},${y}`;
}

export function genRegionId(): string {
  return `rg_${Math.random().toString(16).slice(2, 10)}`;
}

export interface EditorMeta {
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
 * CLAR-603: the only selection types are `cell` and `region`. v0.5.0 SPEC-K12
 * moved the roster out of the map editor entirely, so a canvas selection is the
 * only kind left.
 */
export type Selection =
  | { type: 'cell'; x: number; y: number }
  | { type: 'region'; regionId: string };

interface Snapshot {
  gridSize: number;
  cells: Map<CellKey, DraftCell>;
  regions: DraftRegion[];
  style: MapStyle;
}

export interface EditorState {
  mapId: number | null;
  gridSize: number;
  cells: Map<CellKey, DraftCell>;
  regions: DraftRegion[];
  style: MapStyle;
  activeTool: EditorTool;
  activeLayer: EditorLayer;
  selection: Selection | null;
  selectedRegionId: string | null;
  selectedAssetId: number | null;
  /** v0.6.1: the palette selects an asset **and** one of its forms. */
  selectedFormId: number | null;
  regionDraftSelection: Set<string>;
  zoom: number;
  pan: { x: number; y: number };
  dirty: boolean;
  currentVersionNo: number | null;
  status: 'draft' | 'published';
  past: Snapshot[];
  future: Snapshot[];

  init: (mapId: number, draft: MapDraft, meta: EditorMeta) => void;
  setTool: (tool: EditorTool) => void;
  setLayer: (layer: EditorLayer) => void;
  setSelection: (selection: Selection | null) => void;
  setSelectedRegion: (id: string | null) => void;
  /** v0.6.1: pass both, or neither — the selection is the (asset, form) pair. */
  setSelectedItem: (assetId: number | null, formId?: number | null) => void;

  toggleDraftCell: (x: number, y: number) => void;
  addDraftCells: (cells: Array<[number, number]>) => void;
  removeDraftCells: (cells: Array<[number, number]>) => void;
  clearDraftSelection: () => void;

  /**
   * v0.6.1: the background cell records which form was painted. `formId` is
   * optional so a payload written before background assets could own several
   * forms keeps loading — rendering falls back to the asset's first form.
   */
  placeBackground: (assetId: number, formId: number | undefined, x: number, y: number) => void;
  /**
   * v0.6.1: the caller hands over the chosen **form's** footprint and id; the
   * anchor freezes all three, so later form edits never move placed items.
   */
  placeItem: (
    item: { assetId: number; formId?: number; w: number; h: number },
    x: number,
    y: number,
  ) => void;
  eraseAt: (x: number, y: number) => void;
  clearCell: (x: number, y: number) => void;
  clearItemAt: (x: number, y: number) => void;

  createRegion: (input: RegionInput, mode: ConflictMode) => string;
  toggleRegionCell: (id: string, x: number, y: number) => void;
  updateRegion: (regionId: string, input: RegionInput) => void;
  deleteRegion: (id: string) => void;

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
  setZoom: (zoom: number) => void;
  setPan: (pan: { x: number; y: number }) => void;
  resetView: () => void;

  undo: () => void;
  redo: () => void;
  markSaved: () => void;
  setVersionInfo: (info: { currentVersionNo: number | null; status: 'draft' | 'published' }) => void;
  toDraft: () => MapDraft;
}

function snapshot(state: EditorState): Snapshot {
  return {
    gridSize: state.gridSize,
    cells: new Map(state.cells),
    regions: state.regions.map((region) => ({ ...region, cells: [...region.cells] })),
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
    mapId: null,
    gridSize: GRID_SIZE_DEFAULT,
    cells: new Map(),
    regions: [],
    style: resolveMapStyle(undefined),
    activeTool: 'select',
    activeLayer: 'background',
    selection: null,
    selectedRegionId: null,
    selectedAssetId: null,
    selectedFormId: null,
    regionDraftSelection: new Set<string>(),
    zoom: 1,
    pan: { x: 0, y: 0 },
    dirty: false,
    currentVersionNo: null,
    status: 'draft',
    past: [],
    future: [],

    init: (mapId, draft, meta) => {
      const cells = new Map<CellKey, DraftCell>();
      for (const key of Object.keys(draft.cells)) {
        const cell = draft.cells[key];
        if (cell) cells.set(key as CellKey, cell);
      }
      set({
        mapId,
        gridSize: draft.gridSize,
        cells,
        regions: draft.regions,
        style: resolveMapStyle(draft.style),
        activeTool: 'select',
        activeLayer: 'background',
        selection: null,
        selectedRegionId: null,
        selectedAssetId: null,
        selectedFormId: null,
        regionDraftSelection: new Set<string>(),
        zoom: 1,
        pan: { x: 0, y: 0 },
        dirty: false,
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
    setSelectedItem: (selectedAssetId, formId = null) =>
      set({ selectedAssetId, selectedFormId: selectedAssetId === null ? null : formId }),

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

    placeBackground: (assetId, formId, x, y) =>
      commit((next) => {
        const key = cellKey(x, y);
        const cell: DraftCell = {
          ...(next.cells.get(key) ?? {}),
          background: {
            assetId,
            ...(formId === undefined ? {} : { formId }),
          },
        };
        next.cells.set(key, cell);
      }),

    placeItem: (item, x, y) =>
      commit((next) => {
        for (let dy = 0; dy < item.h; dy += 1) {
          for (let dx = 0; dx < item.w; dx += 1) {
            const key = cellKey(x + dx, y + dy);
            const cell: DraftCell = { ...(next.cells.get(key) ?? {}) };
            delete cell.item;
            if (dx === 0 && dy === 0) {
              cell.item = {
                assetId: item.assetId,
                ...(item.formId === undefined ? {} : { formId: item.formId }),
                w: item.w,
                h: item.h,
              };
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
        if (target.layer === 'item') {
          const anchor = next.cells.get(targetKey)?.item;
          const keys = anchor
            ? itemFootprintKeys(anchor, target.x, target.y)
            : [target.key];
          for (const rawKey of keys) {
            const key = rawKey as CellKey;
            const cell = next.cells.get(key);
            if (!cell) continue;
            const copy = { ...cell };
            delete copy.item;
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

    clearItemAt: (x, y) =>
      commit((next) => {
        const key = cellKey(x, y);
        const cell = next.cells.get(key);
        if (!cell) return;
        const copy = { ...cell };
        delete copy.item;
        if (isEmptyCell(copy)) next.cells.delete(key);
        else next.cells.set(key, copy);
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
          style: resolveMapStyle(draft.style),
          past,
          future: [],
          dirty: true,
          selection: null,
          selectedRegionId: null,
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

    markSaved: () => set({ dirty: false }),
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
        style: state.style,
      };
    },
  };
});
