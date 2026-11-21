import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { toast } from 'sonner';
import { asGameSlugConflict, type GameSlugConflict } from '@loredoku/shared';
import { gamesApi, type DeployGamePayload } from '@/api/games';
import { ApiError } from '@/api/client';
import { errorMessage } from '@/lib/errorMessage';
import { fileFromImageUrl } from '@/lib/fileFromImageUrl';
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

/** 取消部署 = 假删：`/play/{slug}` 立刻 404，「已部署」徽标消失，slug 可重新使用。 */
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


/**
 * 部署谜题为游戏（CONS-K16）：行建好后再传封面，两步共用一个 pending 与一次成功 toast；`clearCover` 只在作者明确移除时传，`coverFromPuzzleUrl` = 没选文件时复制谜题封面；路径冲突可经 `onSlugConflict` 交给调用方问「覆盖 / 取消」，否则直接 toast。
 */
export interface SlugConflictHandler {
  /** 冲突说明 + 触发这次冲突的负载，交给弹窗去问。 */
  (conflict: GameSlugConflict): void;
}

export function useDeployGame(options: { onSlugConflict?: SlugConflictHandler } = {}) {
  const queryClient = useQueryClient();
  const conflictHandler = useRef(options.onSlugConflict);
  conflictHandler.current = options.onSlugConflict;

  return useMutation({
    mutationFn: async ({
      puzzleId,
      name,
      slug,
      difficulty,
      sortWeight,
      clearCover,
      overwriteSlug,
      cover,
      coverFromPuzzleUrl,
    }: DeployGamePayload & {
      puzzleId: number;
      cover?: File | null;
      coverFromPuzzleUrl?: string | null;
    }) => {
      const game = await gamesApi.deploy(puzzleId, {
        name,
        slug,
        difficulty,
        sortWeight,
        clearCover,
        overwriteSlug,
      });
      if (cover) {
        await gamesApi.uploadCover(game.id, cover);
        return game;
      }
      if (coverFromPuzzleUrl) {
        const copied = await fileFromImageUrl(coverFromPuzzleUrl, slug || `game-${game.id}`);
        if (copied) await gamesApi.uploadCover(game.id, copied);
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
        const conflict = asGameSlugConflict(error.details);
        const handler = conflictHandler.current;
        if (conflict && handler) {
          handler(conflict);
          return;
        }
        toast.error(error.message);
        return;
      }
      toast.error(errorMessage(error, '部署失败'));
    },
  });
}

/**
 * 改某一行的权重：成功后只刷列表（排序是服务端事实）；就地编辑，失败必须 toast。
 */
export function useUpdateGameWeight() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, sortWeight }: { id: number; sortWeight: number }) =>
      gamesApi.updateWeight(id, sortWeight),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: gameKeys.all });
    },
    onError: (error) => toast.error(errorMessage(error, '顺序保存失败')),
  });
}
