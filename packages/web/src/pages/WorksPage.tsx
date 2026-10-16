import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Download, Eye, Loader2, Rocket, RotateCcw, Trash2 } from 'lucide-react';
import type { WorkSummary } from '@murdoku/shared';
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
import { versionsApi } from '@/api/versions';
import {
  useAllWorks,
  useCreateDraftFromVersion,
  useDeleteVersion,
} from '@/hooks/useVersions';
import { useGames } from '@/hooks/useGames';
import { GameDeployDialog } from '@/components/game/GameDeployDialog';
import { formatDateTimeMinute } from '@/lib/format';
import {
  buildWorksTable,
  collectWorkProjects,
  EMPTY_WORKS_FILTERS,
  WORKS_PAGE_SIZE_OPTIONS,
  type WorksFilters,
} from '@/lib/worksTable';
import { cn } from '@/lib/utils';

const COLUMNS = [
  '作品编号',
  '地图名称',
  '发布时间',
  '尺寸',
  '参与者数',
  '区域数',
  '物品数',
  '备注',
  '操作',
] as const;

/** §5.3 按地图筛选 — a checkbox dropdown so several maps can be picked. */
function MapFilter({
  projects,
  selected,
  onChange,
}: {
  projects: Array<{ id: number; name: string }>;
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
        ? projects.find((project) => project.id === selected[0])?.name ?? '1 个地图'
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
          {projects.length === 0 ? (
            <p className="px-2 py-2 text-xs text-muted-foreground">暂无可筛选的地图</p>
          ) : (
            projects.map((project) => (
              <label
                key={project.id}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent"
              >
                <input
                  type="checkbox"
                  checked={selectedSet.has(project.id)}
                  onChange={(event) =>
                    onChange(
                      event.target.checked
                        ? [...selected, project.id]
                        : selected.filter((id) => id !== project.id),
                    )
                  }
                />
                <span className="truncate">{project.name}</span>
              </label>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

export function WorksPage(): JSX.Element {
  const navigate = useNavigate();
  const worksQuery = useAllWorks();
  const gamesQuery = useGames();
  const createDraft = useCreateDraftFromVersion();
  const deleteWork = useDeleteVersion();

  const [filters, setFilters] = useState<WorksFilters>(EMPTY_WORKS_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(WORKS_PAGE_SIZE_OPTIONS[0]);
  const [deleteTarget, setDeleteTarget] = useState<WorkSummary | null>(null);
  const [deployTarget, setDeployTarget] = useState<WorkSummary | null>(null);

  useEffect(() => {
    document.title = '作品 · Murdoku Maker';
  }, []);

  // §5.3: any filter / page-size change restarts from the first page.
  useEffect(() => {
    setPage(1);
  }, [filters, pageSize]);

  const works = worksQuery.data ?? [];
  const projects = useMemo(() => collectWorkProjects(works), [works]);
  const table = useMemo(
    () => buildWorksTable(works, filters, page, pageSize),
    [works, filters, page, pageSize],
  );
  // FEAT-G02 §5.1: one game per map, so projectId → gameId is enough to jump
  // from the "已部署" badge straight to the game page.
  const gameIdByProject = useMemo(() => {
    const map = new Map<number, number>();
    for (const game of gamesQuery.data ?? []) {
      map.set(game.projectId, game.id);
    }
    return map;
  }, [gamesQuery.data]);

  const exportWork = (work: WorkSummary): void => {
    void (async () => {
      const detail = await versionsApi.detail(work.projectId, work.versionNo);
      const blob = new Blob([JSON.stringify(detail.data, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${work.projectName}-v${work.versionNo}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    })();
  };

  const confirmDelete = (): void => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    // OPT-210: keep the dialog open until the request settles.
    deleteWork.mutate(
      { id: target.projectId, versionNo: target.versionNo },
      { onSettled: () => setDeleteTarget(null) },
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">作品管理</h1>
          <p className="text-xs text-muted-foreground">
            {worksQuery.isLoading
              ? '正在加载作品…'
              : `全部地图共 ${table.total} 件已发布作品，可预览效果、导出或回滚为草稿。`}
          </p>
        </div>
      </div>

      {/* §5.3 排序与筛选 */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Input
            value={filters.keyword}
            onChange={(event) =>
              setFilters((previous) => ({ ...previous, keyword: event.target.value }))
            }
            placeholder="搜索作品编号 / 备注 / 地图名"
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
          projects={projects}
          selected={filters.projectIds}
          onChange={(projectIds) => setFilters((previous) => ({ ...previous, projectIds }))}
        />
        <Button
          variant="ghost"
          className="h-9"
          onClick={() => setFilters(EMPTY_WORKS_FILTERS)}
        >
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
            {worksQuery.isLoading ? (
              <tr>
                <td colSpan={COLUMNS.length} className="py-12">
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    正在加载作品…
                  </div>
                </td>
              </tr>
            ) : worksQuery.isError ? (
              <tr>
                <td
                  colSpan={COLUMNS.length}
                  className="py-12 text-center text-sm text-muted-foreground"
                >
                  作品加载失败
                </td>
              </tr>
            ) : works.length === 0 ? (
              <tr>
                <td
                  colSpan={COLUMNS.length}
                  className="py-12 text-center text-sm text-muted-foreground"
                >
                  暂无作品，发布一个试试
                </td>
              </tr>
            ) : table.rows.length === 0 ? (
              <tr>
                <td
                  colSpan={COLUMNS.length}
                  className="py-12 text-center text-sm text-muted-foreground"
                >
                  没有符合条件的作品
                </td>
              </tr>
            ) : (
              table.rows.map((work) => (
                <tr key={`${work.projectId}-${work.id}`} className="border-t align-middle">
                  <td className="whitespace-nowrap px-3 py-2 font-medium">v{work.versionNo}</td>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-2">
                      {work.projectName}
                      {work.deployed ? (
                        <button
                          type="button"
                          className="shrink-0 cursor-pointer rounded bg-secondary px-1.5 py-0.5 text-[11px] text-secondary-foreground transition-colors hover:bg-secondary/70"
                          title="该地图已部署为游戏，点击进入游戏页面"
                          onClick={() => {
                            const gameId = gameIdByProject.get(work.projectId);
                            if (gameId === undefined) {
                              navigate('/games');
                              return;
                            }
                            navigate(`/games/${gameId}`);
                          }}
                        >
                          已部署
                        </button>
                      ) : null}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                    {formatDateTimeMinute(work.publishedAt)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                    {work.gridSize} × {work.gridSize}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{work.participantCount}</td>
                  <td className="px-3 py-2 tabular-nums">{work.regionCount}</td>
                  <td className="px-3 py-2 tabular-nums">{work.itemCount}</td>
                  <td className="max-w-[200px] truncate px-3 py-2 text-muted-foreground">
                    {work.notes ?? '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        onClick={() =>
                          navigate(
                            `/works/${work.id}/view?project=${work.projectId}&v=${work.versionNo}`,
                          )
                        }
                      >
                        <Eye className="mr-1 h-3.5 w-3.5" />
                        查看效果
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        onClick={() => setDeployTarget(work)}
                      >
                        <Rocket className="mr-1 h-3.5 w-3.5" />
                        {work.deployed ? '重新部署' : '部署'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        onClick={() => exportWork(work)}
                      >
                        <Download className="mr-1 h-3.5 w-3.5" />
                        导出
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        disabled={createDraft.isPending}
                        onClick={() =>
                          createDraft.mutate(
                            { id: work.projectId, versionNo: work.versionNo },
                            { onSuccess: () => navigate(`/editor/${work.projectId}`) },
                          )
                        }
                      >
                        <RotateCcw className="mr-1 h-3.5 w-3.5" />
                        基于此作品创建草稿
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(work)}
                      >
                        <Trash2 className="mr-1 h-3.5 w-3.5" />
                        删除
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
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
            {WORKS_PAGE_SIZE_OPTIONS.map((size) => (
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
          if (!open && !deleteWork.isPending) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除作品 v{deleteTarget?.versionNo}？</AlertDialogTitle>
            <AlertDialogDescription>
              该作品快照将被永久删除，草稿不受影响。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteWork.isPending}>取消</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deleteWork.isPending}
              onClick={confirmDelete}
            >
              {deleteWork.isPending ? '删除中…' : '删除'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <GameDeployDialog
        work={deployTarget}
        open={deployTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeployTarget(null);
        }}
      />
    </div>
  );
}
