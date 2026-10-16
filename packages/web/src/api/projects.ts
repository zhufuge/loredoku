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
};
