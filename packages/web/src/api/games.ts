import type { GameDifficulty, MapGameDetail, MapGameSummary } from '@loredoku/shared';
import { apiGet, apiPost } from './client';

/**
 * FEAT-G02 (docs/v0.4.0.md §5.4) + OPT-W04 (docs/v0.4.1.md §4.6): deployed
 * games. `POST /api/projects/:id/games` lives next to the versions router
 * because a game is always deployed from a published work; `/api/games` is the
 * flat, cross-map listing the games home page reads, and the game page resolves
 * its game through `/api/games/slug/:slug` (the id route stays for internal use).
 */
export interface DeployGamePayload {
  versionNo: number;
  /** Omitted or empty → the backend falls back to the map name. */
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
  deploy(projectId: number, payload: DeployGamePayload): Promise<MapGameSummary> {
    return apiPost<MapGameSummary>(`/projects/${projectId}/games`, payload);
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
};
