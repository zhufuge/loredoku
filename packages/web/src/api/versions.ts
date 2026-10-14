import type { MapDraft, MapVersionDetail, MapVersionSummary } from '@murdoku/shared';
import { apiGet, apiPost } from './client';

export const versionsApi = {
  publish(id: number, notes?: string): Promise<MapVersionSummary> {
    return apiPost<MapVersionSummary>(`/projects/${id}/versions`, { notes });
  },
  list(id: number): Promise<MapVersionSummary[]> {
    return apiGet<MapVersionSummary[]>(`/projects/${id}/versions`);
  },
  detail(id: number, versionNo: number): Promise<MapVersionDetail> {
    return apiGet<MapVersionDetail>(`/projects/${id}/versions/${versionNo}`);
  },
  createDraftFromVersion(
    id: number,
    versionNo: number,
  ): Promise<{ draft: import('@murdoku/shared').MapDraft; updatedAt: string | null }> {
    return apiPost(`/projects/${id}/versions/${versionNo}/draft`);
  },
};
