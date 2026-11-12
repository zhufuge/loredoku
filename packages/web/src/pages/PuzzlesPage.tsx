import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
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
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { entryPreviewable } from '@/components/common/EntryActionsMenu';
import { ListPager } from '@/components/common/ListPager';
import { SearchInput } from '@/components/common/SearchInput';
import { PageHeader } from '@/components/layout/PageHeader';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
import { fullscreenPath } from '@/lib/workspace';
import { ScopedEmpty } from '@/components/theme/ScopedEmpty';
import { CreatePuzzleDialog } from '@/components/puzzle/CreatePuzzleDialog';
import { EditPuzzleDialog } from '@/components/puzzle/EditPuzzleDialog';
import { ViewToggle } from '@/components/common/ViewToggle';
import { PuzzleGridCard } from '@/components/puzzle/PuzzleGridCard';
import { PuzzleListRow } from '@/components/puzzle/PuzzleListRow';
import { GameDeployDialog } from '@/components/game/GameDeployDialog';
import { useGames } from '@/hooks/useGames';
import {
  useDeletePuzzle,
  useDeletePuzzleVersion,
  useDuplicatePuzzle,
  usePuzzles,
} from '@/hooks/usePuzzles';
import { useStoredView, type ViewMode } from '@/hooks/useStoredView';
import { LoredokuTick } from '@/components/common/LoredokuLoader';

const PAGE_SIZE = 12;

/** 视图选择持久化 —— 纯展示偏好，与地图列表各记各的。 */
const VIEW_STORAGE_KEY = 'loredoku.puzzles.view';

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
  /**
   * v0.8.0 §18：主题来自地址（`/:code/puzzles`）。谜题的边界来自底图，所以这里筛的是
   * 「底图属于哪个主题」—— 与列表里那些谜题实际所属的主题一致。
   */
  const workspace = useWorkspace();
  const themeCode = workspace?.themeCode ?? null;
  const [view, setView] = useStoredView(VIEW_STORAGE_KEY);
  /** `?new={mapId}:{versionNo}` —— 从地图列表「以此版本新建谜题」过来。 */
  const [createOpen, setCreateOpen] = useState(() => searchParams.get('new') !== null);
  const [editTarget, setEditTarget] = useState<PuzzleEntrySummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PuzzleEntrySummary | null>(null);
  /** 只有版本条目会进这里（草稿行不渲染部署按钮）。 */
  const [deployTarget, setDeployTarget] = useState<PuzzleEntrySummary | null>(null);

  useEffect(() => {
    document.title = workspace ? `${workspace.theme.name} · 谜题 · 格物` : '谜题 · 格物';
  }, [workspace?.theme.name]);

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
      themeCode: themeCode ?? undefined,
    }),
    [keyword, sort, themeCode],
  );

  const draftQuery = usePuzzles({ ...shared, kind: 'draft', page: draftPage });
  const versionQuery = usePuzzles({ ...shared, kind: 'version', page: versionPage });
  /** 部署弹窗回填：一条 game 挂一个谜题行，所以按 `puzzleId` 查。 */
  const gamesQuery = useGames();
  const deleteMutation = useDeletePuzzle();
  const deleteVersionMutation = useDeletePuzzleVersion();
  const duplicateMutation = useDuplicatePuzzle();

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
   * 封面 / 名称的主点击：草稿行进编辑器。**版本条目不从这里走** —— v0.7.2
   * 起版本行的封面 / 名称是「预览」（见 `PuzzleListRow`），改版本走独立的
   * 「编辑」按钮（{@link handleEdit}），不再「点一下就在库里多一条草稿」。
   */
  const handleOpen = (entry: PuzzleEntrySummary): void => {
    navigate(fullscreenPath(workspace?.themeCode, 'puzzles', entry.id, 'edit'));
  };

  /**
   * v0.7.2 §3：版本条目的「编辑」= 带 `?v=` 进编辑器的 fork 态 —— 进去**不建
   * 行**、不触发保存，点「保存」时才 fork 出新草稿。
   */
  const handleEdit = (entry: PuzzleEntrySummary): void => {
    if (isVersionEntry(entry) && entry.versionNo !== null) {
      navigate(fullscreenPath(workspace?.themeCode, 'puzzles', entry.id, 'edit', `v=${entry.versionNo}`));
      return;
    }
    navigate(fullscreenPath(workspace?.themeCode, 'puzzles', entry.id, 'edit'));
  };

  /** 预览一条 URL 只由 `:puzzleId` 决定看哪一行 —— 草稿看草稿自己，版本看自己。 */
  const handlePreview = (entry: PuzzleEntrySummary): void => {
    if (!entryPreviewable(entry)) return;
    navigate(fullscreenPath(workspace?.themeCode, 'puzzles', entry.id, 'view'));
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

  const rowProps = {
    onOpen: handleOpen,
    onEdit: handleEdit,
    onRename: setEditTarget,
    onDuplicate: (entry: PuzzleEntrySummary) => duplicateMutation.mutate(entry.id),
    onDelete: setDeleteTarget,
    onPreview: handlePreview,
    onDeploy: handleDeploy,
  };

  /**
   * v0.7.9 §1.1（修正）：两块共用一套渲染，但**视图不同** —— 草稿跟着开关走，
   * 版本恒为列表（与地图页同构）。
   */
  function renderOrderBlock(
    entries: PuzzleEntrySummary[],
    page: number,
    totalPages: number,
    onPage: (next: number) => void,
    keyPrefix: 'draft' | 'version',
    viewMode: ViewMode,
  ): JSX.Element {
    return (
      <>
        {viewMode === 'list' ? (
          <Card className="overflow-hidden">
            {entries.map((entry) => (
              <PuzzleListRow key={`${keyPrefix}-${entry.id}`} entry={entry} {...rowProps} />
            ))}
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {entries.map((entry) => (
              <PuzzleGridCard key={`${keyPrefix}-${entry.id}`} entry={entry} {...rowProps} />
            ))}
          </div>
        )}
        <ListPager page={page} totalPages={totalPages} onPage={onPage} />
      </>
    );
  }

  function renderContent(): JSX.Element {
    if (isLoading) {
      return (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
      if (keyword) {
        return (
          <Card className="flex flex-col items-center gap-3 p-12 text-center">
            <p className="text-sm text-muted-foreground">没有匹配的谜题</p>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1 h-4 w-4" />
              新建谜题
            </Button>
          </Card>
        );
      }
      return (
        <Card className="flex flex-col items-center p-12">
          <ScopedEmpty
            themeName={workspace?.theme.name ?? null}
            noun="谜题"
            action="新建谜题"
            onCreate={() => setCreateOpen(true)}
          />
        </Card>
      );
    }

    return (
      <div className="space-y-8">
        {draftTotal > 0 ? (
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold">
                草稿 <span className="ml-1 text-sm font-normal tabular-nums text-muted-foreground">{draftTotal}</span>
              </h2>
              {/* v0.7.9 §1.1（修正）：开关长在它管的那个标题旁边 —— 只影响草稿块。 */}
              <ViewToggle value={view} onChange={setView} />
            </div>
            {renderOrderBlock(drafts, draftPage, draftPages, setDraftPage, 'draft', view)}
          </section>
        ) : null}

        {versionTotal > 0 ? (
          <section className="space-y-3">
            <h2 className="text-base font-semibold">
              版本 <span className="ml-1 text-sm font-normal tabular-nums text-muted-foreground">{versionTotal}</span>
            </h2>
            {/* v0.7.9 §1.1（修正）：版本恒为列表 —— 冻结快照不需要封面大图。 */}
            {renderOrderBlock(versions, versionPage, versionPages, setVersionPage, 'version', 'list')}
          </section>
        ) : null}
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <PageHeader
        title="谜题"
        description="创建、发布并部署你的谜题。"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            新建谜题
          </Button>
        }
      />

      {/* v0.7.8 §10：与地图页同构 —— 页头 24px，工具条到列表 16px。 */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput
            className="w-full max-w-xs"
            value={keywordInput}
            onValueChange={setKeywordInput}
            placeholder="搜索谜题名称"
          />
          <Select
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as SortOption);
              resetPages();
            }}
            className="w-auto"
          >
            <option value="updatedAt">按更新时间</option>
            <option value="name">按名称</option>
          </Select>
        </div>

        <div className={isFetching && !isLoading ? 'opacity-60 transition-opacity' : undefined}>
          {renderContent()}
        </div>
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
                  <LoredokuTick className="mr-1" />
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
