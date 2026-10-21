import type { GameDifficulty, MapGameDetail, MapGameSummary } from '@loredoku/shared';
import { apiDelete, apiGet, apiPost } from './client';

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
  /** OPT-W04: omitted or empty → `puzzle-{name}-{difficulty}`. */
  slug?: string;
  /**
   * OPT-W03 §3: `true` drops the stored cover. Omitting both this and a new
   * cover keeps the existing artwork.
   */
  clearCover?: boolean;
  difficulty?: GameDifficulty;
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
};
