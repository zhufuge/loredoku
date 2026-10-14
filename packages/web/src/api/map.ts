import type { MapData, MapCell } from '@murdoku/shared';
import { apiGet, apiPut } from './client';

export interface SaveRegionPayload {
  name: string;
  description: string | null;
  color: string;
  borderWidth: number;
  fillOpacity: number;
  cells: Array<{ x: number; y: number }>;
}

export interface SaveMapPayload {
  updatedAt?: string;
  cells: MapCell[];
  regions: SaveRegionPayload[];
}

export const mapApi = {
  get(id: number): Promise<MapData> {
    return apiGet<MapData>(`/projects/${id}/map`);
  },
  save(id: number, payload: SaveMapPayload): Promise<MapData> {
    return apiPut<MapData>(`/projects/${id}/map`, payload);
  },
};
