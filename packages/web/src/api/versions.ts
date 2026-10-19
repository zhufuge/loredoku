import type { MapDraft } from '@loredoku/shared';
import type {
  MapVersionDetail,
  MapVersionEntry,
  MapVersionSummary,
  MapDetail,
} from '@loredoku/shared';
import { apiDelete, apiGet, apiPost } from './client';

/**
 * `map_versions` — one row per publish, shown as a
 * version entry in the map list.
 */
export const versionsApi = {
  /**
   * 版本号默认由服务端给 `MAX+1`；`version` 是可选的，传了就按用户填的
   * 正整数发布（可填空洞号），不传与服务端默认一致。
   */
  publish(id: number, version?: number): Promise<MapVersionSummary> {
    return apiPost<MapVersionSummary>(
      `/maps/${id}/versions`,
      version === undefined ? {} : { version },
    );
  },
  /** SPEC-K13 §7.4: the whole blood lineage, each entry naming its owner row. */
  list(id: number): Promise<MapVersionEntry[]> {
    return apiGet<MapVersionEntry[]>(`/maps/${id}/versions`);
  },
  detail(id: number, versionNo: number): Promise<MapVersionDetail> {
    return apiGet<MapVersionDetail>(`/maps/${id}/versions/${versionNo}`);
  },
  /**
   * SPEC-K11 (Q3 = B): 「编辑此版本」 opens a **new work entry** in the same
   * lineage. `map_versions` is never written — that is what makes a version
   * immutable.
   *
   * `data` 可选 —— 版本条目进编辑器后「保存时才生成草稿」，
   * 编辑器那一刻的画布随 fork 一起写进新行；不传则用快照 data。
   */
  fork(id: number, versionNo: number, data?: MapDraft): Promise<MapDetail> {
    return apiPost<MapDetail>(`/maps/${id}/versions/${versionNo}/fork`, data ? { data } : {});
  },
  remove(id: number, versionNo: number): Promise<null> {
    return apiDelete<null>(`/maps/${id}/versions/${versionNo}`);
  },
};
