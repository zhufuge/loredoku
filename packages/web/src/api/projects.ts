import type { PaginatedData, Project, ProjectDetail } from '@loredoku/shared';
import { apiDelete, apiGet, apiPatch, apiPost } from './client';

export type ProjectSort = 'updatedAt' | 'name' | 'createdAt';

export interface ProjectListParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  sort?: ProjectSort;
  order?: 'asc' | 'desc';
}

export interface CreateProjectPayload {
  name: string;
  description?: string;
  gridSize: number;
}

export interface UpdateProjectPayload {
  name?: string;
  description?: string | null;
}

export const projectsApi = {
  list(params: ProjectListParams): Promise<PaginatedData<ProjectDetail>> {
    return apiGet<PaginatedData<ProjectDetail>>('/projects', { params });
  },
  detail(id: number): Promise<ProjectDetail> {
    return apiGet<ProjectDetail>(`/projects/${id}`);
  },
  create(payload: CreateProjectPayload): Promise<Project> {
    return apiPost<Project>('/projects', payload);
  },
  update(id: number, payload: UpdateProjectPayload): Promise<Project> {
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
