import type { MapDraft, MapResponse, ResizeResult } from '@loredoku/shared';
import { apiGet, apiPatch, apiPost, apiPut } from './client';

/**
 * 保存整份草稿只提交 `data`；服务端后写覆盖，不做并发比对。
 */
export interface SaveMapPayload {
  data: MapDraft;
}

export const mapCanvasApi = {
  get(id: number): Promise<MapResponse> {
    return apiGet<MapResponse>(`/maps/${id}/map`);
  },
  save(id: number, payload: SaveMapPayload): Promise<MapResponse> {
    return apiPut<MapResponse>(`/maps/${id}/map`, payload);
  },
  updateGridSize(id: number, gridSize: number): Promise<ResizeResult> {
    return apiPatch<ResizeResult>(`/maps/${id}/grid-size`, { gridSize });
  },
  export(id: number): Promise<MapDraft> {
    return apiGet<MapDraft>(`/maps/${id}/map/export`);
  },
  import(id: number, data: MapDraft): Promise<MapResponse> {
    return apiPost<MapResponse>(`/maps/${id}/map/import`, { data });
  },
};
