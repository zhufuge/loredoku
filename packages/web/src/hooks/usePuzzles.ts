import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ErrorCode,
  type GameToolIconKind,
  type PublishViolation,
  type PuzzleDraft,
  type PuzzleEntrySummary,
} from '@loredoku/shared';
import {
  puzzlesApi,
  type CreatePuzzlePayload,
  type PuzzleListParams,
  type SavePuzzlePayload,
  type UpdatePuzzlePayload,
} from '@/api/puzzles';
import { ApiError } from '@/api/client';
import { gameKeys } from './useGames';
import type { PublishResult } from './useVersions';

export const puzzleKeys = {
  all: ['puzzles'] as const,
  /** 与地图列表同构：参数进 key，两块的页码各自独立。 */
  list: (params: PuzzleListParams) => [...puzzleKeys.all, 'list', params] as const,
  detail: (id: number) => [...puzzleKeys.all, 'detail', id] as const,
  map: (id: number) => [...puzzleKeys.all, 'map', id] as const,
  versions: (id: number) => [...puzzleKeys.all, 'versions', id] as const,
  version: (id: number, versionNo: number) =>
    [...puzzleKeys.all, 'version', id, versionNo] as const,
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function usePuzzles(params: PuzzleListParams) {
  return useQuery({
    queryKey: puzzleKeys.list(params),
    queryFn: () => puzzlesApi.list(params),
    placeholderData: (previous) => previous,
  });
}

export function usePuzzle(id: number | null) {
  return useQuery({
    queryKey: puzzleKeys.detail(id ?? 0),
    queryFn: () => puzzlesApi.detail(id as number),
    enabled: id !== null && Number.isFinite(id),
  });
}

/** 编辑器渲染的只读画布 —— 谜题自己的副本。 */
export function usePuzzleMapContext(id: number | null) {
  return useQuery({
    queryKey: puzzleKeys.map(id ?? 0),
    queryFn: () => puzzlesApi.map(id as number),
    enabled: id !== null && Number.isFinite(id),
  });
}

/** 血统内的版本历史（活行，版本号倒序）。 */
export function usePuzzleVersions(id: number | null) {
  return useQuery({
    queryKey: puzzleKeys.versions(id ?? 0),
    queryFn: () => puzzlesApi.listVersions(id as number),
    enabled: id !== null && Number.isFinite(id),
  });
}

/**
 * 建谜题时选的封面在建行**之后**才传（上传端点认 id），所以创建与上传合成
 * 一次 mutation，共用一个 pending 状态和一条成功提示。
 */
export function useCreatePuzzle(onSuccess?: (id: number) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ cover, ...payload }: CreatePuzzlePayload & { cover?: File | null }) => {
      const created = await puzzlesApi.create(payload);
      if (!cover) return created;
      return puzzlesApi.uploadCover(created.id, cover);
    },
    onSuccess: (puzzle) => {
      toast.success('谜题创建成功');
      void queryClient.invalidateQueries({ queryKey: puzzleKeys.all });
      onSuccess?.(puzzle.id);
    },
    onError: (error) => toast.error(errorMessage(error, '创建失败')),
  });
}

export function useSavePuzzle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: SavePuzzlePayload }) =>
      puzzlesApi.save(id, payload),
    onSuccess: (data, { id }) => {
      queryClient.setQueryData(puzzleKeys.detail(id), data);
      void queryClient.invalidateQueries({ queryKey: puzzleKeys.all });
      toast.success('谜题已保存');
    },
    onError: (error, { id }) => {
      // 409 = 另一个会话先写了；重取一次，让编辑器显示活下来的那份草稿。
      void queryClient.invalidateQueries({ queryKey: puzzleKeys.detail(id) });
      toast.error(errorMessage(error, '保存失败'));
    },
  });
}

export function useUpdatePuzzle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UpdatePuzzlePayload }) =>
      puzzlesApi.update(id, payload),
    onSuccess: (data) => {
      queryClient.setQueryData(puzzleKeys.detail(data.id), data);
      void queryClient.invalidateQueries({ queryKey: puzzleKeys.all });
    },
    onError: (error) => toast.error(errorMessage(error, '更新失败')),
  });
}

export function useDeletePuzzle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => puzzlesApi.remove(id),
    onSuccess: () => {
      toast.success('谜题已删除');
      void queryClient.invalidateQueries({ queryKey: puzzleKeys.all });
      void queryClient.invalidateQueries({ queryKey: gameKeys.all });
    },
    onError: (error) => toast.error(errorMessage(error, '删除失败')),
  });
}

export function useDuplicatePuzzle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => puzzlesApi.duplicate(id),
    onSuccess: () => {
      toast.success('谜题已复制');
      void queryClient.invalidateQueries({ queryKey: puzzleKeys.all });
    },
    onError: (error) => toast.error(errorMessage(error, '复制失败')),
  });
}

export function useUploadPuzzleCover() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file }: { id: number; file: File }) => puzzlesApi.uploadCover(id, file),
    onSuccess: (data) => {
      queryClient.setQueryData(puzzleKeys.detail(data.id), data);
      void queryClient.invalidateQueries({ queryKey: puzzleKeys.all });
      toast.success('封面上传成功');
    },
    onError: (error) => toast.error(errorMessage(error, '封面上传失败')),
  });
}

/**
 * v0.8.6 §4：标记图上传。
 *
 * 失败**不在这里 toast**：调用方（抽屉）要把「原值保留 + 一行错误」画在控件旁边，
 * 同一次失败在页角和控件旁各报一遍只会吵。这里只负责成功后刷新谜题详情。
 */
export function useUploadPuzzleMark() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file }: { id: number; file: File }) =>
      puzzlesApi.uploadMark(id, file),
    onSuccess: (_data, { id }) => {
      void queryClient.invalidateQueries({ queryKey: puzzleKeys.detail(id) });
    },
  });
}

/**
 * v0.8.7 §7：工具按钮图标上传（清除 / 撤回 / 提交）。
 *
 * 与标记逐条相同：失败不 toast（抽屉在控件旁报），成功刷新谜题详情。一次一枚，
 * 所以 `icon` 跟着参数走 —— 三枚的 `path` 各自独立，不能合成一次请求。
 */
export function useUploadPuzzleToolIcon() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, icon, file }: { id: number; icon: GameToolIconKind; file: File }) =>
      puzzlesApi.uploadToolIcon(id, icon, file),
    onSuccess: (_data, { id }) => {
      void queryClient.invalidateQueries({ queryKey: puzzleKeys.detail(id) });
    },
  });
}

export function useRemovePuzzleCover() {  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => puzzlesApi.removeCover(id),
    onSuccess: (data) => {
      queryClient.setQueryData(puzzleKeys.detail(data.id), data);
      void queryClient.invalidateQueries({ queryKey: puzzleKeys.all });
    },
    onError: (error) => toast.error(errorMessage(error, '操作失败')),
  });
}

/**
 * 发布：与地图同一套结果约定 —— 校验未通过（422）折成 `{ ok: false }` 让调用方
 * 展开问题清单，其余错误照常抛给 mutation 的 `onError`。
 */
export function usePublishPuzzle(id: number) {
  const queryClient = useQueryClient();
  return useMutation<PublishResult<PuzzleEntrySummary>, unknown, number | undefined>({
    mutationFn: async (version) => {
      try {
        const published = await puzzlesApi.publish(id, version);
        return { ok: true, version: published };
      } catch (error) {
        if (error instanceof ApiError && error.code === ErrorCode.PUBLISH_VALIDATION_FAILED) {
          const violations = Array.isArray(error.details)
            ? (error.details as PublishViolation[])
            : [];
          return { ok: false, violations };
        }
        throw error;
      }
    },
    onSuccess: (result) => {
      if (!result.ok) return;
      void queryClient.invalidateQueries({ queryKey: puzzleKeys.all });
    },
    onError: (error) => toast.error(errorMessage(error, '发布失败')),
  });
}

/**
 * 「编辑此版本」= fork 出一条新草稿行，版本行不动。
 *
 * v0.7.2 §3.3：编辑器 `?v=` 态下「保存才 fork」，所以 `data` 可选（不带就用
 * 版本快照）。`navigate: false` 供编辑器自己接管落盘后的跳转 —— 它要 replace
 * 到新行、并且先把 store 的身份换成新行；这里再跳一次就成了双跳。
 */
export function useForkPuzzleVersion(options: { navigate?: boolean } = {}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: ({
      id,
      versionNo,
      data,
      mapSource,
    }: {
      id: number;
      versionNo: number;
      data?: PuzzleDraft;
      mapSource?: { mapId: number; versionNo: number };
    }) => puzzlesApi.forkVersion(id, versionNo, data, mapSource),
    onSuccess: (created, { versionNo }) => {
      void queryClient.invalidateQueries({ queryKey: puzzleKeys.all });
      if (options.navigate !== false) {
        toast.success(`已从 v${versionNo} 新增一个条目`);
        navigate(`/puzzles/${created.id}/edit`);
      }
    },
    onError: (error) => toast.error(errorMessage(error, '操作失败')),
  });
}

export function useDeletePuzzleVersion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, versionNo }: { id: number; versionNo: number }) =>
      puzzlesApi.removeVersion(id, versionNo),
    onSuccess: () => {
      toast.success('版本已删除');
      void queryClient.invalidateQueries({ queryKey: puzzleKeys.all });
    },
    onError: (error) => toast.error(errorMessage(error, '删除失败')),
  });
}

/** Narrow helper so callers can build a `PuzzleDraft` without importing types. */
export type { PuzzleDraft };
