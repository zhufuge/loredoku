import type {
  PuzzleDetail,
  PuzzleDraft,
  PuzzleMapContext,
  PuzzleSummary,
} from '@loredoku/shared';
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from './client';

/**
 * v0.5.0 FEAT-K01 (docs/v0.5.0.md §2.2) — the puzzle module. A puzzle owns the
 * roster + palette and only **references** one published map version, so the
 * canvas arrives separately through `GET /puzzles/:id/map` (read-only).
 */
export interface CreatePuzzlePayload {
  name: string;
  description?: string | null;
  /** The published map version the puzzle draws on (`maps.id`). */
  mapId: number;
  mapVersionNo: number;
}

export interface UpdatePuzzlePayload {
  name?: string;
  description?: string | null;
}

export interface SavePuzzlePayload {
  data: PuzzleDraft;
  updatedAt?: string | null;
}

export const puzzlesApi = {
  list(): Promise<PuzzleSummary[]> {
    return apiGet<PuzzleSummary[]>('/puzzles');
  },
  create(payload: CreatePuzzlePayload): Promise<PuzzleDetail> {
    return apiPost<PuzzleDetail>('/puzzles', payload);
  },
  detail(id: number): Promise<PuzzleDetail> {
    return apiGet<PuzzleDetail>(`/puzzles/${id}`);
  },
  /** §5.1: the referenced version's canvas, read-only, palette already stripped. */
  map(id: number): Promise<PuzzleMapContext> {
    return apiGet<PuzzleMapContext>(`/puzzles/${id}/map`);
  },
  save(id: number, payload: SavePuzzlePayload): Promise<PuzzleDetail> {
    return apiPut<PuzzleDetail>(`/puzzles/${id}`, payload);
  },
  update(id: number, payload: UpdatePuzzlePayload): Promise<PuzzleDetail> {
    return apiPatch<PuzzleDetail>(`/puzzles/${id}`, payload);
  },
  remove(id: number): Promise<null> {
    return apiDelete<null>(`/puzzles/${id}`);
  },
  /** 沿用同一个地图版本引用（与地图复制沿用同一 `cover_path` 同款约定）。 */
  duplicate(id: number): Promise<PuzzleDetail> {
    return apiPost<PuzzleDetail>(`/puzzles/${id}/duplicate`);
  },
};
