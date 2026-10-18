import type { MapDraft } from '@loredoku/shared';
import type {
  MapVersionDetail,
  MapVersionEntry,
  MapVersionSummary,
  ProjectDetail,
} from '@loredoku/shared';
import { apiDelete, apiGet, apiPost } from './client';

/**
 * v0.5.0 (docs/v0.5.0.md §7): `map_versions` — one row per publish, shown as a
 * version entry in the map list.
 */
export const versionsApi = {
  /**
   * v0.5.8 第三阶段（设计 §4.2）：版本号默认服务端给 `MAX+1`，用户可在发布弹窗
   * 里改成任意正整数（可填空洞号），所以 `version` 是可选入参 —— 不传就与服务端
   * 默认一致。
   */
  publish(id: number, version?: number): Promise<MapVersionSummary> {
    return apiPost<MapVersionSummary>(
      `/projects/${id}/versions`,
      version === undefined ? {} : { version },
    );
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
   *
   * v0.5.8 §13: `data` 可选 —— 版本条目进编辑器后「保存时才生成草稿」，
   * 编辑器那一刻的画布随 fork 一起写进新行；不传则用快照 data。
   */
  fork(id: number, versionNo: number, data?: MapDraft): Promise<ProjectDetail> {
    return apiPost<ProjectDetail>(`/projects/${id}/versions/${versionNo}/fork`, data ? { data } : {});
  },
  remove(id: number, versionNo: number): Promise<null> {
    return apiDelete<null>(`/projects/${id}/versions/${versionNo}`);
  },
};
