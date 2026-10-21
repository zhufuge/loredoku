import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { gamesApi, type DeployGamePayload } from '@/api/games';
import { ApiError } from '@/api/client';
import { puzzleKeys } from './usePuzzles';

export const gameKeys = {
  all: ['games', 'all'] as const,
  /** OPT-W04: the game page is keyed by its access path, not its id. */
  detail: (slug: string) => ['games', 'detail', slug] as const,
};

/** FEAT-G01: the games home page lists every deployed game, newest first. */
export function useGames() {
  return useQuery({
    queryKey: gameKeys.all,
    queryFn: () => gamesApi.list(),
    placeholderData: (previous) => previous,
  });
}

/**
 * v0.7.1 §7.4：取消部署 = 假删。玩家的 `/play/{slug}` 立刻 404，谜题列表的
 * 「已部署」徽标同步消失，slug 随之可被重新使用。
 */
export function useCancelGame() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => gamesApi.cancel(id),
    onSuccess: () => {
      toast.success('已取消部署');
      void queryClient.invalidateQueries({ queryKey: gameKeys.all });
      // 「已部署」徽标与「可删版本」的判定都读谜题行，列表要跟着刷新。
      void queryClient.invalidateQueries({ queryKey: puzzleKeys.all });
    },
    onError: (error) => toast.error(errorMessage(error, '取消部署失败')),
  });
}

/** FEAT-G03 + OPT-W04: the game page renders the snapshot captured at deploy. */
export function useGameDetail(slug: string | null) {
  return useQuery({
    queryKey: gameKeys.detail(slug ?? ''),
    queryFn: () => gamesApi.detailBySlug(slug as string),
    enabled: slug !== null && slug.length > 0,
  });
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/**
 * CONS-K16 (docs/v0.5.0.md §10.2): deploy a **puzzle** as a game. The cover
 * (when one was picked) is uploaded right after the row exists, so both steps
 * share one pending state and a single success toast.
 *
 * OPT-W03 §3: `clearCover` rides along with the deploy (`true` only when the
 * author explicitly removed the existing cover) — omitting the cover entirely
 * keeps whatever the game already had.
 */
export function useDeployGame() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      puzzleId,
      name,
      slug,
      difficulty,
      clearCover,
      cover,
    }: DeployGamePayload & { puzzleId: number; cover?: File | null }) => {
      const game = await gamesApi.deploy(puzzleId, {
        name,
        slug,
        difficulty,
        clearCover,
      });
      if (cover) {
        await gamesApi.uploadCover(game.id, cover);
      }
      return game;
    },
    onSuccess: () => {
      toast.success('部署成功，谜题已生成为游戏');
      void queryClient.invalidateQueries({ queryKey: gameKeys.all });
      void queryClient.invalidateQueries({ queryKey: puzzleKeys.all });
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
