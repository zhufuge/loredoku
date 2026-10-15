import type {
  MapDraft,
  MapVersionDetail,
  MapVersionSummary,
  WorkSummary,
} from '@murdoku/shared';
import { apiDelete, apiGet, apiPost } from './client';

/**
 * Works = published map versions (`map_versions`).
 * The backend keeps the `version` wording; the UI calls them 作品.
 */
export const versionsApi = {
  publish(id: number, notes?: string): Promise<MapVersionSummary> {
    return apiPost<MapVersionSummary>(`/projects/${id}/versions`, { notes });
  },
  list(id: number): Promise<MapVersionSummary[]> {
    return apiGet<MapVersionSummary[]>(`/projects/${id}/versions`);
  },
  /** OPT-905 §5.1: every work across all maps, for the flat works table. */
  listAll(): Promise<WorkSummary[]> {
    return apiGet<WorkSummary[]>('/versions');
  },
  detail(id: number, versionNo: number): Promise<MapVersionDetail> {
    return apiGet<MapVersionDetail>(`/projects/${id}/versions/${versionNo}`);
  },
  createDraftFromVersion(
    id: number,
    versionNo: number,
  ): Promise<{ draft: MapDraft; updatedAt: string | null }> {
    return apiPost(`/projects/${id}/versions/${versionNo}/draft`);
  },
  remove(id: number, versionNo: number): Promise<null> {
    return apiDelete<null>(`/projects/${id}/versions/${versionNo}`);
  },
};
