import type {
  PaginatedData,
  PuzzleDetail,
  PuzzleDraft,
  PuzzleEntrySummary,
  PuzzleMapContext,
} from '@loredoku/shared';
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from './client';

/**
 * 谜题模块的端点（v0.7.1 §6.3）。谜题自带底图画布，所以 `/puzzles/:id/map`
 * 读的是**自己那份副本**（只读），不再 join 地图版本。
 */
export type PuzzleSort = 'updatedAt' | 'name' | 'createdAt';

/** 与 `/api/maps` 同参数 —— `kind` 让「草稿」「版本」两块各自分页。 */
export interface PuzzleListParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  kind?: 'draft' | 'version';
  sort?: PuzzleSort;
  order?: 'asc' | 'desc';
  /** v0.8.0 §19：按主题编码筛。 */
  themeCode?: string;
}

export interface CreatePuzzlePayload {
  name: string;
  /** v0.8.5 §7：编码 —— 部署时那串访问路径的中段。 */
  code: string;
  description?: string | null;
  /** 建谜题时复制哪一份底图（maps 版本行）。 */
  mapId: number;
  mapVersionNo: number;
}

export interface UpdatePuzzlePayload {
  name?: string;
  /** v0.8.5 §7：改编码（v0.8.5 之前建的谜题靠它补写）。 */
  code?: string;
  description?: string | null;
}

export interface SavePuzzlePayload {
  data: PuzzleDraft;
  updatedAt?: string | null;
  /**
   * v0.7.3 §3.4：引入新地图时只交来源，画布由服务端从那份已发布版本读。
   * 与服务端存量的来源相同 → 服务端直接短路，不查版本。
   */
  mapSource?: { mapId: number; versionNo: number };
}

export const puzzlesApi = {
  list(params: PuzzleListParams): Promise<PaginatedData<PuzzleEntrySummary>> {
    return apiGet<PaginatedData<PuzzleEntrySummary>>('/puzzles', { params });
  },
  create(payload: CreatePuzzlePayload): Promise<PuzzleDetail> {
    return apiPost<PuzzleDetail>('/puzzles', payload);
  },
  detail(id: number): Promise<PuzzleDetail> {
    return apiGet<PuzzleDetail>(`/puzzles/${id}`);
  },
  /** 编辑器渲染的只读画布（谜题自己的副本）。 */
  map(id: number): Promise<PuzzleMapContext> {
    return apiGet<PuzzleMapContext>(`/puzzles/${id}/map`);
  },
  save(id: number, payload: SavePuzzlePayload): Promise<PuzzleDetail> {
    return apiPut<PuzzleDetail>(`/puzzles/${id}`, payload);
  },
  update(id: number, payload: UpdatePuzzlePayload): Promise<PuzzleDetail> {
    return apiPatch<PuzzleDetail>(`/puzzles/${id}`, payload);
  },
  remove(id: number): Promise<null> {
    return apiDelete<null>(`/puzzles/${id}`);
  },
  duplicate(id: number): Promise<PuzzleDetail> {
    return apiPost<PuzzleDetail>(`/puzzles/${id}/duplicate`);
  },
  uploadCover(id: number, file: File): Promise<PuzzleDetail> {
    const form = new FormData();
    form.append('file', file);
    return apiPost<PuzzleDetail>(`/puzzles/${id}/cover`, form);
  },
  removeCover(id: number): Promise<PuzzleDetail> {
    return apiDelete<PuzzleDetail>(`/puzzles/${id}/cover`);
  },
  /**
   * v0.8.6 §4：上传「禁止符号」那张图（multipart 字段 `file`）。返回落盘后的相对
   * 路径与站内地址 —— 路径要写进草稿的 `forbiddenSymbol`，地址只给调用方预览用。
   */
  uploadForbiddenSymbol(id: number, file: File): Promise<{ path: string; url: string }> {
    const form = new FormData();
    form.append('file', file);
    return apiPost<{ path: string; url: string }>(`/puzzles/${id}/forbidden-symbol`, form);
  },

  /** 发布 = 血统里新增一条版本行；`version` 省略时由服务端续号。 */
  publish(id: number, version?: number): Promise<PuzzleEntrySummary> {
    return apiPost<PuzzleEntrySummary>(`/puzzles/${id}/versions`, version ? { version } : {});
  },
  listVersions(id: number): Promise<PuzzleEntrySummary[]> {
    return apiGet<PuzzleEntrySummary[]>(`/puzzles/${id}/versions`);
  },
  versionDetail(id: number, versionNo: number): Promise<PuzzleDetail> {
    return apiGet<PuzzleDetail>(`/puzzles/${id}/versions/${versionNo}`);
  },
  /**
   * 「编辑此版本」= fork 出一条新草稿行（版本行不动）。
   *
   * `data` 可选：编辑器 `?v=` 态「保存时才生成草稿」，带的是作者此刻的草稿；
   * 不传就用版本快照（版本历史面板的老用法）。`mapSource` 同理（v0.7.3）。
   */
  forkVersion(
    id: number,
    versionNo: number,
    data?: PuzzleDraft,
    mapSource?: { mapId: number; versionNo: number },
  ): Promise<PuzzleDetail> {
    return apiPost<PuzzleDetail>(`/puzzles/${id}/versions/${versionNo}/fork`, {
      ...(data ? { data } : {}),
      ...(mapSource ? { mapSource } : {}),
    });
  },
  removeVersion(id: number, versionNo: number): Promise<null> {
    return apiDelete<null>(`/puzzles/${id}/versions/${versionNo}`);
  },
};
