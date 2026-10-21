import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LayoutGrid, List, Loader2, Plus, Search } from 'lucide-react';
import type { MapGameSummary, PuzzleEntrySummary } from '@loredoku/shared';
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
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { entryPreviewable } from '@/components/common/EntryActionsMenu';
import { CreatePuzzleDialog } from '@/components/puzzle/CreatePuzzleDialog';
import { EditPuzzleDialog } from '@/components/puzzle/EditPuzzleDialog';
import { PuzzleGridCard } from '@/components/puzzle/PuzzleGridCard';
import { PuzzleListRow } from '@/components/puzzle/PuzzleListRow';
import { GameDeployDialog } from '@/components/game/GameDeployDialog';
import { useGames } from '@/hooks/useGames';
import {
  useDeletePuzzle,
  useDeletePuzzleVersion,
  useDuplicatePuzzle,
  useForkPuzzleVersion,
  usePuzzles,
} from '@/hooks/usePuzzles';

const PAGE_SIZE = 12;

/** 视图选择持久化 —— 纯展示偏好，与地图列表各记各的。 */
const VIEW_STORAGE_KEY = 'loredoku.puzzles.view';

type ViewMode = 'grid' | 'list';

function readStoredView(): ViewMode {
  if (typeof window === 'undefined') return 'grid';
  return window.localStorage.getItem(VIEW_STORAGE_KEY) === 'list' ? 'list' : 'grid';
}

type SortOption = 'updatedAt' | 'name';

/**
 * 谜题列表与地图列表同构（v0.7.1 §6）：正文拆「草稿」「版本」两块，
 * **两块各自分页** —— 同一端点带 `kind` 发两个请求，各带自己的页号与 `total`。
 * 并集分页时期两块共享一页，版本密集时某一页可能只出现版本块、草稿全在别页。
 *
 * 关键词与排序都走服务端（客户端只能排当前页）。排序两块共用一套。
 *
 * 按钮集与地图一致（编辑信息 / 预览 / 复制 / 删除），只多一个**部署**：
 * 它只出现在版本条目上 —— 草稿永远不满足「已发布」，按钮连渲染都不渲染。
 */
export function PuzzlesPage(): JSX.Element {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [draftPage, setDraftPage] = useState(1);
  const [versionPage, setVersionPage] = useState(1);
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [sort, setSort] = useState<SortOption>('updatedAt');
  const [view, setView] = useState<ViewMode>(readStoredView);
  /** `?new={mapId}:{versionNo}` —— 从地图列表「以此版本新建谜题」过来。 */
  const [createOpen, setCreateOpen] = useState(() => searchParams.get('new') !== null);
  const [editTarget, setEditTarget] = useState<PuzzleEntrySummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PuzzleEntrySummary | null>(null);
  /** 只有版本条目会进这里（草稿行不渲染部署按钮）。 */
  const [deployTarget, setDeployTarget] = useState<PuzzleEntrySummary | null>(null);

  useEffect(() => {
    document.title = '谜题 · 格物';
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(VIEW_STORAGE_KEY, view);
    }
  }, [view]);

  const resetPages = (): void => {
    setDraftPage(1);
    setVersionPage(1);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setKeyword(keywordInput.trim());
      resetPages();
    }, 300);
    return () => clearTimeout(timer);
  }, [keywordInput]);

  const shared = useMemo(
    () => ({
      pageSize: PAGE_SIZE,
      keyword: keyword || undefined,
      sort,
      order: 'desc' as const,
    }),
    [keyword, sort],
  );

  const draftQuery = usePuzzles({ ...shared, kind: 'draft', page: draftPage });
  const versionQuery = usePuzzles({ ...shared, kind: 'version', page: versionPage });
  /** 部署弹窗回填：一条 game 挂一个谜题行，所以按 `puzzleId` 查。 */
  const gamesQuery = useGames();
  const deleteMutation = useDeletePuzzle();
  const deleteVersionMutation = useDeletePuzzleVersion();
  const duplicateMutation = useDuplicatePuzzle();
  const forkMutation = useForkPuzzleVersion();

  const drafts = draftQuery.data?.list ?? [];
  const versions = versionQuery.data?.list ?? [];
  const draftTotal = draftQuery.data?.total ?? 0;
  const versionTotal = versionQuery.data?.total ?? 0;
  const draftPages = Math.max(1, Math.ceil(draftTotal / PAGE_SIZE));
  const versionPages = Math.max(1, Math.ceil(versionTotal / PAGE_SIZE));

  const isLoading = draftQuery.isLoading || versionQuery.isLoading;
  const isError = draftQuery.isError || versionQuery.isError;
  const isFetching = draftQuery.isFetching || versionQuery.isFetching;
  const error = draftQuery.error ?? versionQuery.error;

  const refetch = (): void => {
    void draftQuery.refetch();
    void versionQuery.refetch();
  };

  /** 删完当页最后一条时页号会越过新的总页数 —— 收敛到最后一页。 */
  useEffect(() => {
    if (draftPage > draftPages) setDraftPage(draftPages);
  }, [draftPage, draftPages]);

  useEffect(() => {
    if (versionPage > versionPages) setVersionPage(versionPages);
  }, [versionPage, versionPages]);

  const gameByPuzzle = useMemo(() => {
    const map = new Map<number, MapGameSummary>();
    for (const game of gamesQuery.data ?? []) map.set(game.puzzleId, game);
    return map;
  }, [gamesQuery.data]);

  const isVersionEntry = (entry: PuzzleEntrySummary): boolean => entry.kind === 'version';

  /**
   * 主点击按 kind 分叉：草稿行进编辑器；版本行**先 fork 出一条新草稿行**再进
   * 编辑器（版行本身不可写，谜题编辑器也不做地图那种 `?v=` 的 fork 态）。
   */
  const handleOpen = (entry: PuzzleEntrySummary): void => {
    if (isVersionEntry(entry) && entry.versionNo !== null) {
      forkMutation.mutate(
        { id: entry.id, versionNo: entry.versionNo },
        { onSuccess: (created) => navigate(`/puzzles/${created.id}/edit`) },
      );
      return;
    }
    navigate(`/puzzles/${entry.id}/edit`);
  };

  /** 预览一条 URL 只由 `:puzzleId` 决定看哪一行 —— 草稿看草稿自己，版本看自己。 */
  const handlePreview = (entry: PuzzleEntrySummary): void => {
    if (!entryPreviewable(entry)) return;
    navigate(`/puzzles/${entry.id}/view`);
  };

  const handleDeploy = (entry: PuzzleEntrySummary): void => {
    // 第 1 层拦截：草稿行永远到不了这里（按钮不渲染）。
    if (!isVersionEntry(entry)) return;
    setDeployTarget(entry);
  };

  const confirmDelete = (): void => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    if (isVersionEntry(target) && target.versionNo !== null) {
      deleteVersionMutation.mutate(
        { id: target.id, versionNo: target.versionNo },
        { onSuccess: () => setDeleteTarget(null) },
      );
      return;
    }
    deleteMutation.mutate(target.id, { onSuccess: () => setDeleteTarget(null) });
  };

  const deleting = deleteMutation.isPending || deleteVersionMutation.isPending;

  function renderPager(
    page: number,
    totalPages: number,
    total: number,
    onPage: (next: number) => void,
  ): JSX.Element | null {
    if (totalPages <= 1) return null;
    return (
      <div className="flex items-center justify-end gap-3 text-sm text-muted-foreground">
        <span>
          第 {page} / {totalPages} 页 · 共 {total} 个
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPage(Math.max(1, page - 1))}
        >
          上一页
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPage(Math.min(totalPages, page + 1))}
        >
          下一页
        </Button>
      </div>
    );
  }

  const rowProps = {
    onOpen: handleOpen,
    onRename: setEditTarget,
    onDuplicate: (entry: PuzzleEntrySummary) => duplicateMutation.mutate(entry.id),
    onDelete: setDeleteTarget,
    onPreview: handlePreview,
    onDeploy: handleDeploy,
  };

  function renderContent(): JSX.Element {
    if (isLoading) {
      return (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-72 w-full" />
          ))}
        </div>
      );
    }

    if (isError) {
      return (
        <Card className="flex flex-col items-center gap-3 p-12 text-center">
          <p className="text-sm text-muted-foreground">
            {error instanceof Error ? error.message : '加载失败'}
          </p>
          <Button variant="outline" onClick={() => refetch()}>
            重试
          </Button>
        </Card>
      );
    }

    if (draftTotal === 0 && versionTotal === 0) {
      return (
        <Card className="flex flex-col items-center gap-3 p-12 text-center">
          <p className="text-sm text-muted-foreground">
            {keyword ? '没有匹配的谜题' : '还没有谜题，创建一个开始吧'}
          </p>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            新建谜题
          </Button>
        </Card>
      );
    }

    return (
      <div className="space-y-8">
        {draftTotal > 0 ? (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">
              草稿 <span className="ml-1 font-normal text-muted-foreground">{draftTotal}</span>
            </h2>
            {view === 'list' ? (
              <Card className="overflow-hidden">
                {drafts.map((entry) => (
                  <PuzzleListRow key={`draft-${entry.id}`} entry={entry} {...rowProps} />
                ))}
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {drafts.map((entry) => (
                  <PuzzleGridCard key={`draft-${entry.id}`} entry={entry} {...rowProps} />
                ))}
              </div>
            )}
            {renderPager(draftPage, draftPages, draftTotal, setDraftPage)}
          </section>
        ) : null}

        {versionTotal > 0 ? (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">
              版本 <span className="ml-1 font-normal text-muted-foreground">{versionTotal}</span>
            </h2>
            <Card className="overflow-hidden">
              {versions.map((entry) => (
                <PuzzleListRow key={`version-${entry.id}`} entry={entry} {...rowProps} />
              ))}
            </Card>
            {renderPager(versionPage, versionPages, versionTotal, setVersionPage)}
          </section>
        ) : null}
      </div>
    );
  }

  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">谜题</h1>
          <p className="text-sm text-muted-foreground">创建、发布并部署你的谜题。</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          新建谜题
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={keywordInput}
            onChange={(event) => setKeywordInput(event.target.value)}
            placeholder="搜索谜题名称"
            className="pl-9"
          />
        </div>
        <select
          value={sort}
          onChange={(event) => {
            setSort(event.target.value as SortOption);
            resetPages();
          }}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="updatedAt">按更新时间</option>
          <option value="name">按名称</option>
        </select>
        <div className="ml-auto flex items-center gap-1 rounded-md border p-1">
          <Button
            size="icon"
            variant={view === 'grid' ? 'secondary' : 'ghost'}
            title="网格视图"
            onClick={() => setView('grid')}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant={view === 'list' ? 'secondary' : 'ghost'}
            title="列表视图"
            onClick={() => setView('list')}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className={isFetching && !isLoading ? 'opacity-60 transition-opacity' : undefined}>
        {renderContent()}
      </div>

      <CreatePuzzleDialog open={createOpen} onOpenChange={setCreateOpen} />
      <EditPuzzleDialog
        entry={editTarget}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
      />

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent
          onEscapeKeyDown={(event) => {
            if (deleting) event.preventDefault();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTarget && isVersionEntry(deleteTarget)
                ? `删除谜题版本 v${deleteTarget.versionNo ?? ''}？`
                : `删除谜题「${deleteTarget?.name}」？`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && isVersionEntry(deleteTarget)
                ? '该版本将从列表中移除，已部署为游戏的版本需先取消部署。'
                : '该谜题及其参与者配置将被永久删除，底图与已发布的版本不受影响。'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <Button variant="destructive" disabled={deleting} onClick={confirmDelete}>
              {deleting ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  删除中…
                </>
              ) : (
                '删除'
              )}
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
    </section>
  );
}
