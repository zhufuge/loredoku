import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { PuzzleDraft } from '@loredoku/shared';
import {
  puzzlesApi,
  type CreatePuzzlePayload,
  type SavePuzzlePayload,
  type UpdatePuzzlePayload,
} from '@/api/puzzles';
import { gameKeys } from './useGames';
import { mapEntryKeys } from './useMaps';

/**
 * v0.5.0 FEAT-K01 (docs/v0.5.0.md §2) — the puzzle module's data layer. The
 * canvas arrives through its own query key because it belongs to the
 * **referenced map version**, not to the puzzle: it is read-only and never
 * saved back.
 */
export const puzzleKeys = {
  all: ['puzzles'] as const,
  list: () => [...puzzleKeys.all, 'list'] as const,
  detail: (id: number) => [...puzzleKeys.all, 'detail', id] as const,
  map: (id: number) => [...puzzleKeys.all, 'map', id] as const,
};

/** SPEC-K02: the flat, cross-map puzzle table (the old works table). */
export function usePuzzles() {
  return useQuery({
    queryKey: puzzleKeys.list(),
    queryFn: () => puzzlesApi.list(),
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

/** §5.1: the read-only canvas the puzzle draws on. */
export function usePuzzleMapContext(id: number | null) {
  return useQuery({
    queryKey: puzzleKeys.map(id ?? 0),
    queryFn: () => puzzlesApi.map(id as number),
    enabled: id !== null && Number.isFinite(id),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export function useCreatePuzzle(onSuccess?: (id: number) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreatePuzzlePayload) => puzzlesApi.create(payload),
    onSuccess: (puzzle) => {
      toast.success('谜题创建成功');
      void queryClient.invalidateQueries({ queryKey: puzzleKeys.all });
      onSuccess?.(puzzle.id);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '创建失败');
    },
  });
}

export function useSavePuzzle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: SavePuzzlePayload }) =>
      puzzlesApi.save(id, payload),
    onSuccess: (data, { id }) => {
      queryClient.setQueryData(puzzleKeys.detail(id), data);
      void queryClient.invalidateQueries({ queryKey: puzzleKeys.list() });
      toast.success('谜题已保存');
    },
    onError: (error, { id }) => {
      // A 409 means another session wrote first — reload so the editor shows
      // the surviving draft instead of an unrecoverable local state.
      void queryClient.invalidateQueries({ queryKey: puzzleKeys.detail(id) });
      toast.error(error instanceof Error ? error.message : '保存失败');
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
      void queryClient.invalidateQueries({ queryKey: puzzleKeys.list() });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '更新失败');
    },
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
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '删除失败');
    },
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
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '复制失败');
    },
  });
}

/** Narrow helper so callers can build a `PuzzleDraft` without importing types. */
export type { PuzzleDraft };
