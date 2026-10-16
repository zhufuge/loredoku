import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { GameDifficulty } from '@murdoku/shared';
import { gamesApi, type DeployGamePayload } from '@/api/games';
import { ApiError } from '@/api/client';
import { versionKeys } from './useVersions';
import { projectKeys } from './useProjects';

export const gameKeys = {
  all: ['games', 'all'] as const,
  detail: (id: number) => ['games', 'detail', id] as const,
};

/** FEAT-G01: the games home page lists every deployed game, newest first. */
export function useGames() {
  return useQuery({
    queryKey: gameKeys.all,
    queryFn: () => gamesApi.list(),
    placeholderData: (previous) => previous,
  });
}

/** FEAT-G03: the game page renders the snapshot captured at deploy time. */
export function useGameDetail(id: number | null) {
  return useQuery({
    queryKey: gameKeys.detail(id ?? 0),
    queryFn: () => gamesApi.detail(id as number),
    enabled: id !== null && Number.isFinite(id),
  });
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/**
 * FEAT-G02: deploy a published work as a game. The cover (when one was picked)
 * is uploaded right after the row exists, so both steps share one pending state
 * and a single success toast.
 */
export function useDeployGame() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      projectId,
      versionNo,
      name,
      difficulty,
      cover,
    }: DeployGamePayload & { projectId: number; cover?: File | null }) => {
      const game = await gamesApi.deploy(projectId, { versionNo, name, difficulty });
      if (cover) {
        await gamesApi.uploadCover(game.id, cover);
      }
      return game;
    },
    onSuccess: (_game, { projectId }) => {
      toast.success('部署成功，作品已生成为游戏');
      void queryClient.invalidateQueries({ queryKey: gameKeys.all });
      void queryClient.invalidateQueries({ queryKey: versionKeys.all });
      void queryClient.invalidateQueries({ queryKey: versionKeys.list(projectId) });
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        toast.error(error.message);
        return;
      }
      toast.error(errorMessage(error, '部署失败'));
    },
  });
}
