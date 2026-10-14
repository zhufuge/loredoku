import type { MapDraft, MapResponse, ResizeResult } from '@murdoku/shared';
import { apiGet, apiPatch, apiPost, apiPut } from './client';

export interface SaveMapPayload {
  data: MapDraft;
  updatedAt?: string | null;
}

export const mapApi = {
  get(id: number): Promise<MapResponse> {
    return apiGet<MapResponse>(`/projects/${id}/map`);
  },
  save(id: number, payload: SaveMapPayload): Promise<MapResponse> {
    return apiPut<MapResponse>(`/projects/${id}/map`, payload);
  },
  updateGridSize(id: number, gridSize: number): Promise<ResizeResult> {
    return apiPatch<ResizeResult>(`/projects/${id}/grid-size`, { gridSize });
  },
  export(id: number): Promise<MapDraft> {
    return apiGet<MapDraft>(`/projects/${id}/map/export`);
  },
  import(id: number, data: MapDraft): Promise<MapResponse> {
    return apiPost<MapResponse>(`/projects/${id}/map/import`, { data });
  },
};
