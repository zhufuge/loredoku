import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ChevronDown,
  Download,
  Eye,
  Loader2,
  Pencil,
  Plus,
  Rocket,
  Trash2,
} from 'lucide-react';
import type { MapGameSummary, PuzzleSummary } from '@loredoku/shared';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CreatePuzzleDialog } from '@/components/puzzle/CreatePuzzleDialog';
import { GameDeployDialog } from '@/components/game/GameDeployDialog';
import { puzzlesApi } from '@/api/puzzles';
import { useDeletePuzzle, useDuplicatePuzzle, usePuzzles } from '@/hooks/usePuzzles';
import { useGames } from '@/hooks/useGames';
import { formatDateTimeMinute } from '@/lib/format';
import {
  buildPuzzlesTable,
  collectPuzzleMaps,
  EMPTY_PUZZLE_FILTERS,
  PUZZLES_PAGE_SIZE_OPTIONS,
  type PuzzleFilters,
} from '@/lib/puzzlesTable';
import { cn } from '@/lib/utils';

/**
 * SPEC-K02 (docs/v0.5.0.md §2.3): the puzzle table is the old works table
 * **verbatim** — five columns in the same order with the same wording, the same
 * filter bar, the same paging bar and the same row buttons. Only the values are
 * the puzzle's now (see the mapping table in §2.3), and the page gains one
 * thing: a 「新建谜题」 primary button (§2.4).
 */
const COLUMNS = ['名称', '版本', '部署状态', '发布时间', '操作'] as const;

/** §5.3 按地图筛选 — a checkbox dropdown so several maps can be picked. */
function MapFilter({
  maps,
  selected,
  onChange,
}: {
  maps: Array<{ id: number; name: string }>;
  selected: number[];
  onChange: (ids: number[]) => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent): void => {
      if (containerRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const selectedSet = new Set(selected);
  const label =
    selected.length === 0
      ? '全部地图'
      : selected.length === 1
        ? maps.find((map) => map.id === selected[0])?.name ?? '1 个地图'
        : `${selected.length} 个地图`;

  return (
    <div ref={containerRef} className="relative">
      <Button
        variant="outline"
        className="h-9 w-48 justify-between font-normal"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="truncate">{label}</span>
        <ChevronDown className="ml-1 h-4 w-4 shrink-0 opacity-60" />
      </Button>
      {open ? (
        <div className="absolute right-0 z-30 mt-1 max-h-72 w-56 overflow-y-auto rounded-md border bg-background p-1 shadow-lg">
          <button
            type="button"
            className="w-full rounded px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent"
            onClick={() => onChange([])}
          >
            清空选择（全部地图）
          </button>
          {maps.length === 0 ? (
            <p className="px-2 py-2 text-xs text-muted-foreground">暂无可筛选的地图</p>
          ) : (
            maps.map((map) => (
              <label
                key={map.id}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent"
              >
                <input
                  type="checkbox"
                  checked={selectedSet.has(map.id)}
                  onChange={(event) =>
                    onChange(
                      event.target.checked
                        ? [...selected, map.id]
                        : selected.filter((id) => id !== map.id),
                    )
                  }
                />
                <span className="truncate">{map.name}</span>
              </label>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

export function PuzzlesPage(): JSX.Element {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const puzzlesQuery = usePuzzles();
  const gamesQuery = useGames();
  const deletePuzzle = useDeletePuzzle();
  const duplicatePuzzle = useDuplicatePuzzle();

  const [filters, setFilters] = useState<PuzzleFilters>(EMPTY_PUZZLE_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PUZZLES_PAGE_SIZE_OPTIONS[0]);
  const [deleteTarget, setDeleteTarget] = useState<PuzzleSummary | null>(null);
  const [deployTarget, setDeployTarget] = useState<PuzzleSummary | null>(null);
  /**
   * §2.4: `?new={mapId}:{versionNo}` — a version entry in the map list
   * sends the author here with the map version already picked.
   */
  const [createOpen, setCreateOpen] = useState(() => searchParams.get('new') !== null);

  useEffect(() => {
    document.title = '谜题 · 格物';
  }, []);

  // §5.3: any filter / page-size change restarts from the first page.
  useEffect(() => {
    setPage(1);
  }, [filters, pageSize]);

  const puzzles = puzzlesQuery.data ?? [];
  const maps = useMemo(() => collectPuzzleMaps(puzzles), [puzzles]);
  const table = useMemo(
    () => buildPuzzlesTable(puzzles, filters, page, pageSize),
    [puzzles, filters, page, pageSize],
  );
  /**
   * CONS-K16 (docs/v0.5.0.md §10.2): one game per **puzzle** now, so the map
   * is `puzzleId → game` — it links the 「已部署」 badge and prefills the
   * re-deploy dialog with the values used last time.
   */
  const gameByPuzzle = useMemo(() => {
    const map = new Map<number, MapGameSummary>();
    for (const game of gamesQuery.data ?? []) {
      if (game.puzzleId !== null) map.set(game.puzzleId, game);
    }
    return map;
  }, [gamesQuery.data]);

  /** FEAT-K08: export the puzzle's own draft (`PuzzleDraft` v1). */
  const exportPuzzle = (puzzle: PuzzleSummary): void => {
    void (async () => {
      try {
        const detail = await puzzlesApi.detail(puzzle.id);
        const blob = new Blob([JSON.stringify(detail.data, null, 2)], {
          type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${puzzle.name}-puzzle.json`;
        anchor.click();
        URL.revokeObjectURL(url);
      } catch {
        /* errors surfaced via mutation toasts */
      }
    })();
  };

  const confirmDelete = (): void => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    // OPT-210: keep the dialog open until the request settles.
    deletePuzzle.mutate(target.id, { onSettled: () => setDeleteTarget(null) });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">谜题</h1>
          <p className="text-xs text-muted-foreground">
            {puzzlesQuery.isLoading
              ? '正在加载谜题…'
              : `全部地图共 ${table.total} 件谜题，可预览效果、导出或部署为游戏。`}
          </p>
        </div>
        {/* SPEC-K03 §2.4: the only addition to the table itself. */}
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          新建谜题
        </Button>
      </div>

      {/* §5.3 排序与筛选 */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Input
            value={filters.keyword}
            onChange={(event) =>
              setFilters((previous) => ({ ...previous, keyword: event.target.value }))
            }
            placeholder="搜索名称 / 版本号 / 描述"
            className="h-9"
          />
        </div>
        <div className="flex items-center gap-1">
          <Input
            type="date"
            value={filters.from ?? ''}
            onChange={(event) =>
              setFilters((previous) => ({ ...previous, from: event.target.value || null }))
            }
            className="h-9 w-40"
            title="发布时间起始"
          />
          <span className="text-xs text-muted-foreground">至</span>
          <Input
            type="date"
            value={filters.to ?? ''}
            onChange={(event) =>
              setFilters((previous) => ({ ...previous, to: event.target.value || null }))
            }
            className="h-9 w-40"
            title="发布时间结束"
          />
        </div>
        <MapFilter
          maps={maps}
          selected={filters.mapIds}
          onChange={(mapIds) =>
            setFilters((previous) => ({ ...previous, mapIds }))
          }
        />
        <Button variant="ghost" className="h-9" onClick={() => setFilters(EMPTY_PUZZLE_FILTERS)}>
          重置
        </Button>
      </div>

      {/* §5.2 表格 */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[960px] border-collapse text-sm">
          <thead>
            <tr className="bg-muted/50 text-xs text-muted-foreground">
              {COLUMNS.map((column) => (
                <th
                  key={column}
                  className={cn(
                    'whitespace-nowrap px-3 py-2 text-left font-medium',
                    column === '操作' && 'text-right',
                  )}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {puzzlesQuery.isLoading ? (
              <tr>
                <td colSpan={COLUMNS.length} className="py-12">
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    正在加载谜题…
                  </div>
                </td>
              </tr>
            ) : puzzlesQuery.isError ? (
              <tr>
                <td
                  colSpan={COLUMNS.length}
                  className="py-12 text-center text-sm text-muted-foreground"
                >
                  谜题加载失败
                </td>
              </tr>
            ) : puzzles.length === 0 ? (
              <tr>
                <td
                  colSpan={COLUMNS.length}
                  className="py-12 text-center text-sm text-muted-foreground"
                >
                  暂无谜题，新建一个试试
                </td>
              </tr>
            ) : table.rows.length === 0 ? (
              <tr>
                <td
                  colSpan={COLUMNS.length}
                  className="py-12 text-center text-sm text-muted-foreground"
                >
                  没有符合条件的谜题
                </td>
              </tr>
            ) : (
              table.rows.map((puzzle) => {
                const game = gameByPuzzle.get(puzzle.id) ?? null;
                const isDeployed = game !== null && puzzle.deployed;
                return (
                  <tr key={puzzle.id} className="border-t align-middle">
                    <td className="px-3 py-2 font-medium" title={`地图：${puzzle.mapName}`}>
                      {puzzle.name}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                      v{puzzle.mapVersionNo}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {isDeployed ? (
                        <button
                          type="button"
                          className="shrink-0 cursor-pointer rounded bg-secondary px-1.5 py-0.5 text-[11px] text-secondary-foreground transition-colors hover:bg-secondary/70"
                          title="该谜题已部署为游戏，点击进入游戏页面"
                          onClick={() => navigate(`/play/${game.slug}`)}
                        >
                          已部署
                        </button>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                      {formatDateTimeMinute(puzzle.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <div className="flex flex-wrap justify-end gap-2">
                        {/* FEAT-N05 (docs/v0.5.3.md §4): 编辑 leads the row —
                            it is what a puzzle row is opened for. The five
                            columns and their order are untouched (SPEC-K02). */}
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={() => navigate(`/puzzles/${puzzle.id}/edit`)}
                        >
                          <Pencil className="mr-1 h-3.5 w-3.5" />
                          编辑
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={() => navigate(`/puzzles/${puzzle.id}/view`)}
                        >
                          <Eye className="mr-1 h-3.5 w-3.5" />
                          查看效果
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={() => setDeployTarget(puzzle)}
                        >
                          <Rocket className="mr-1 h-3.5 w-3.5" />
                          {isDeployed ? '重新部署' : '部署'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={() => exportPuzzle(puzzle)}
                        >
                          <Download className="mr-1 h-3.5 w-3.5" />
                          导出
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          disabled={duplicatePuzzle.isPending}
                          onClick={() =>
                            duplicatePuzzle.mutate(puzzle.id, {
                              onSuccess: (created) => navigate(`/puzzles/${created.id}/edit`),
                            })
                          }
                        >
                          复制
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(puzzle)}
                        >
                          <Trash2 className="mr-1 h-3.5 w-3.5" />
                          删除
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* §5.3 分页 */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          共 {table.total} 条，第 {table.page} / {table.totalPages} 页
        </span>
        <div className="flex items-center gap-2">
          <span>每页</span>
          <select
            className="h-8 rounded-md border bg-background px-2 text-xs"
            value={pageSize}
            onChange={(event) => setPageSize(Number(event.target.value))}
          >
            {PUZZLES_PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size} 条
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            disabled={table.page <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            上一页
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            disabled={table.page >= table.totalPages}
            onClick={() => setPage((value) => value + 1)}
          >
            下一页
          </Button>
        </div>
      </div>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deletePuzzle.isPending) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除谜题「{deleteTarget?.name}」？</AlertDialogTitle>
            <AlertDialogDescription>
              该谜题及其参与者配置将被永久删除，所引用的地图版本不受影响。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePuzzle.isPending}>取消</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deletePuzzle.isPending}
              onClick={confirmDelete}
            >
              {deletePuzzle.isPending ? '删除中…' : '删除'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <GameDeployDialog
        puzzle={deployTarget}
        existingGame={deployTarget ? gameByPuzzle.get(deployTarget.id) ?? null : null}
        open={deployTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeployTarget(null);
        }}
      />

      <CreatePuzzleDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
