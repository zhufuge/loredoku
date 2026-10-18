import type { MapDraft, MapResponse, ResizeResult } from '@loredoku/shared';
import { apiGet, apiPatch, apiPost, apiPut } from './client';

/**
 * 保存整份草稿只提交 `data`；服务端后写覆盖，不做并发比对。
 */
export interface SaveMapPayload {
  data: MapDraft;
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
