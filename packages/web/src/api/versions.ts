import type {
  MapVersionDetail,
  MapVersionEntry,
  MapVersionSummary,
  ProjectDetail,
} from '@loredoku/shared';
import { apiDelete, apiGet, apiPost } from './client';

/**
 * v0.5.0 (docs/v0.5.0.md §7): `map_versions` is a **map version** again — one
 * row per publish, shown as a version entry in the map list. The old flat
 * 「作品」 listing is gone (the puzzle table replaced it).
 */
export const versionsApi = {
  publish(id: number, notes?: string): Promise<MapVersionSummary> {
    return apiPost<MapVersionSummary>(`/projects/${id}/versions`, { notes });
  },
  /** SPEC-K13 §7.4: the whole blood lineage, each entry naming its owner row. */
  list(id: number): Promise<MapVersionEntry[]> {
    return apiGet<MapVersionEntry[]>(`/projects/${id}/versions`);
  },
  detail(id: number, versionNo: number): Promise<MapVersionDetail> {
    return apiGet<MapVersionDetail>(`/projects/${id}/versions/${versionNo}`);
  },
  /**
   * SPEC-K11 (Q3 = B): 「编辑此版本」 opens a **new work entry** in the same
   * lineage. `map_versions` is never written — that is what makes a version
   * immutable.
   */
  fork(id: number, versionNo: number): Promise<ProjectDetail> {
    return apiPost<ProjectDetail>(`/projects/${id}/versions/${versionNo}/fork`);
  },
  remove(id: number, versionNo: number): Promise<null> {
    return apiDelete<null>(`/projects/${id}/versions/${versionNo}`);
  },
};
