import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { toast } from 'sonner';
import { asGameSlugConflict, type GameSlugConflict } from '@loredoku/shared';
import { gamesApi, type DeployGamePayload } from '@/api/games';
import { ApiError } from '@/api/client';
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
 *
 * v0.7.2 §4：`coverFromPuzzleUrl` = 作者没选文件、游戏也还没有封面，于是把
 * **谜题自己的封面**复制成游戏封面（读成 File 再走同一条上传端点）。
 *
 * v0.7.11：路径冲突不再只是一条 toast。传了 `onSlugConflict` 的调用方（部署
 * 弹窗）会收到一份结构化说明，由它弹出「覆盖 / 取消」；没传的调用方保持原样
 * —— 直接 toast 报错。冲突本身不会被这条 hook 吞掉，`isError` 仍然成立。
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
