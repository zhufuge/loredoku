import type {
  MapEntrySummary,
  PaginatedData,
  Project,
  ProjectDetail,
  PublishedMapVersion,
} from '@loredoku/shared';
import { apiDelete, apiGet, apiPatch, apiPost } from './client';

export type MapSort = 'updatedAt' | 'name' | 'createdAt';

export interface MapListParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  sort?: MapSort;
  order?: 'asc' | 'desc';
}

/** v0.5.8: 创建时不再要画布尺寸 —— 尺寸在编辑器首次进入时写入草稿。 */
export interface CreateMapPayload {
  name: string;
  description?: string;
}

export interface UpdateMapPayload {
  name?: string;
  description?: string | null;
}

export const mapsApi = {
  /**
   * FEAT-K09 (docs/v0.5.0.md §7.1): the map list is the **union of work entries
   * and version entries** grouped by blood-lineage root, not a flat list of
   * `maps` rows.
   */
  list(params: MapListParams): Promise<PaginatedData<MapEntrySummary>> {
    return apiGet<PaginatedData<MapEntrySummary>>('/projects', { params });
  },
  /** FEAT-K03 §2.4: every published version, for the puzzle picker. */
  listPublishedVersions(): Promise<PublishedMapVersion[]> {
    return apiGet<PublishedMapVersion[]>('/projects/versions');
  },
  detail(id: number): Promise<ProjectDetail> {
    return apiGet<ProjectDetail>(`/projects/${id}`);
  },
  create(payload: CreateMapPayload): Promise<Project> {
    return apiPost<Project>('/projects', payload);
  },
  update(id: number, payload: UpdateMapPayload): Promise<Project> {
    return apiPatch<Project>(`/projects/${id}`, payload);
  },
  remove(id: number): Promise<null> {
    return apiDelete<null>(`/projects/${id}`);
  },
  duplicate(id: number): Promise<Project> {
    return apiPost<Project>(`/projects/${id}/duplicate`);
  },
  /**
   * FEAT-H03 §3.2(c) (docs/v0.4.2.md §3): create / update are JSON, so the cover
   * travels in its own multipart request — and only after the row exists. Both
   * routes answer with the refreshed detail, so the card repaints from it.
   */
  uploadCover(id: number, file: File): Promise<ProjectDetail> {
    const form = new FormData();
    form.append('file', file);
    return apiPost<ProjectDetail>(`/projects/${id}/cover`, form);
  },
  /** FEAT-H03 §3.2(a): the explicit 「移除」 button — clears `cover_path`. */
  removeCover(id: number): Promise<ProjectDetail> {
    return apiDelete<ProjectDetail>(`/projects/${id}/cover`);
  },
};
