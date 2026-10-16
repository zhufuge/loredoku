import type { GameDifficulty, MapGameDetail, MapGameSummary } from '@loredoku/shared';
import { apiGet, apiPost } from './client';

/**
 * FEAT-G02 (docs/v0.4.0.md §5.4): deployed games. `POST /api/projects/:id/games`
 * lives next to the versions router because a game is always deployed from a
 * published work; `/api/games` is the flat, cross-map listing the games home
 * page reads.
 */
export interface DeployGamePayload {
  versionNo: number;
  /** Omitted or empty → the backend falls back to the map name. */
  name?: string;
  difficulty?: GameDifficulty;
}

export const gamesApi = {
  list(): Promise<MapGameSummary[]> {
    return apiGet<MapGameSummary[]>('/games');
  },
  detail(id: number): Promise<MapGameDetail> {
    return apiGet<MapGameDetail>(`/games/${id}`);
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
