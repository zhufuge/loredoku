import type { MapGameDetail, MapGameSummary } from '@loredoku/shared';
import { apiDelete, apiGet, apiPatch, apiPost } from './client';

/**
 * CONS-K16 (docs/v0.5.0.md §10.2): the unit of deployment is a **puzzle** now —
 * a puzzle owns the participants a game plays with, while the map version only
 * provides the canvas. `POST /api/puzzles/:id/games` therefore carries no
 * `versionNo` (the puzzle pins the version it draws on), and `/api/games` is
 * still the flat, cross-map listing the games home page reads.
 */
export interface DeployGamePayload {
  /** Omitted or empty → the backend falls back to the puzzle name. */
  name?: string;
  /** OPT-W04: omitted or empty → `puzzle-{name}`（v0.8.1 起难度不进路径）. */
  slug?: string;
  /**
   * OPT-W03 §3: `true` drops the stored cover. Omitting both this and a new
   * cover keeps the existing artwork.
   */
  clearCover?: boolean;
  /**
   * v0.7.11：路径被别的谜题版本占着时覆盖它（占位那条部署被假删）。
   * 只应由「覆盖」弹窗的确认按钮传 —— 默认 `false`，冲突仍然是错误。
   */
  overwriteSlug?: boolean;
  /** v0.8.3：主题里的一档难度标识（内置五档之一或自定义 key）。 */
  difficulty?: string;
  /**
   * v0.8.3：展示顺序（升序，小的在前，同权重按访问路径）。
   * **缺省 ≠ 0** —— 不传表示「沿用这条部署上一次的值」，重新部署不会把顺序清零。
   */
  sortWeight?: number;
}

export const gamesApi = {
  list(): Promise<MapGameSummary[]> {
    return apiGet<MapGameSummary[]>('/games');
  },
  /** Kept for id-based callers (the cover upload flow). */
  detail(id: number): Promise<MapGameDetail> {
    return apiGet<MapGameDetail>(`/games/${id}`);
  },
  /** OPT-W04: the game page's data source. */
  detailBySlug(slug: string): Promise<MapGameDetail> {
    return apiGet<MapGameDetail>(`/games/slug/${encodeURIComponent(slug)}`);
  },
  deploy(puzzleId: number, payload: DeployGamePayload): Promise<MapGameSummary> {
    return apiPost<MapGameSummary>(`/puzzles/${puzzleId}/games`, payload);
  },
  /**
   * The cover is uploaded after the deploy, because the row (and therefore the
   * game id the upload targets) only exists once the game has been created.
   */
  uploadCover(id: number, file: File): Promise<MapGameSummary> {
    const form = new FormData();
    form.append('file', file);
    return apiPost<MapGameSummary>(`/games/${id}/cover`, form);
  },
  /** v0.7.1 §7.4：取消部署 = 假删（`deleted_at`），访问路径随之释放。 */
  cancel(id: number): Promise<null> {
    return apiDelete<null>(`/games/${id}`);
  },
  /**
   * v0.8.5：部署页就地改权重。只有这一个键 —— 重发整份部署负载会顺手把名称、
   * 路径、难度一起写回去，而列表上的那些值可能已经比弹窗里的新。
   */
  updateWeight(id: number, sortWeight: number): Promise<MapGameSummary> {
    return apiPatch<MapGameSummary>(`/games/${id}`, { sortWeight });
  },
};
