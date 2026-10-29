import type {
  MapEntrySummary,
  PaginatedData,
  MapEntry,
  MapDetail,
  PublishedMapVersion,
} from '@loredoku/shared';
import { apiDelete, apiGet, apiPatch, apiPost } from './client';

export type MapSort = 'updatedAt' | 'name' | 'createdAt';

export interface MapListParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  kind?: 'draft' | 'version';
  sort?: MapSort;
  order?: 'asc' | 'desc';
  /** v0.8.0 §19：按主题编码筛。 */
  themeCode?: string;
}

export interface CreateMapPayload {
  name: string;
  description?: string;
  /** v0.8.0 §19：这张图属于哪个主题。**必填**，用编码。 */
  themeCode: string;
}

export interface UpdateMapPayload {
  name?: string;
  description?: string | null;
}

export const mapsApi = {
  list(params: MapListParams): Promise<PaginatedData<MapEntrySummary>> {
    return apiGet<PaginatedData<MapEntrySummary>>('/maps', { params });
  },
  listPublishedVersions(): Promise<PublishedMapVersion[]> {
    return apiGet<PublishedMapVersion[]>('/maps/versions');
  },
  detail(id: number): Promise<MapDetail> {
    return apiGet<MapDetail>(`/maps/${id}`);
  },
  create(payload: CreateMapPayload): Promise<MapEntry> {
    return apiPost<MapEntry>('/maps', payload);
  },
  update(id: number, payload: UpdateMapPayload): Promise<MapEntry> {
    return apiPatch<MapEntry>(`/maps/${id}`, payload);
  },
  remove(id: number): Promise<null> {
    return apiDelete<null>(`/maps/${id}`);
  },
  duplicate(id: number): Promise<MapEntry> {
    return apiPost<MapEntry>(`/maps/${id}/duplicate`);
  },
  uploadCover(id: number, file: File): Promise<MapDetail> {
    const form = new FormData();
    form.append('file', file);
    return apiPost<MapDetail>(`/maps/${id}/cover`, form);
  },
  removeCover(id: number): Promise<MapDetail> {
    return apiDelete<MapDetail>(`/maps/${id}/cover`);
  },
};
