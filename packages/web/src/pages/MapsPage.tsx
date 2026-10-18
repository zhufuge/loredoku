import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutGrid, List, Loader2, Plus, Search } from 'lucide-react';
import type { MapEntrySummary } from '@loredoku/shared';
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
import {
  CreateProjectDialog,
  EditProjectDialog,
} from '@/components/project/ProjectFormDialogs';
import { ProjectGridCard } from '@/components/project/ProjectGridCard';
import { ProjectListRow } from '@/components/project/ProjectListRow';
import { useDeleteMap, useDuplicateMap, useMaps } from '@/hooks/useMaps';
import { useDeleteVersion } from '@/hooks/useVersions';

const PAGE_SIZE = 12;

type ViewMode = 'grid' | 'list';
type SortOption = 'updatedAt' | 'name';
/** §7.1 第 3 条: 三态筛选，默认「全部」。 */
type KindFilter = 'all' | 'draft' | 'version';

/**
 * v0.5.0 FEAT-K09 (docs/v0.5.0.md §7.1): the map list is the **union of work
 * entries and version entries**, so `useMaps` answers with
 * `PaginatedData<MapEntrySummary>` instead of `ProjectDetail[]`.
 *
 * Two view-only controls were added on top of the unchanged keyword / sort /
 * view switches: a 三态 kind filter (default 「全部」) and a 按地图归组 toggle
 * (default off) — both applied to the current page, so the default view is
 * pixel-identical to v0.4.3.
 */
export function MapsPage(): JSX.Element {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [sort, setSort] = useState<SortOption>('updatedAt');
  const [view, setView] = useState<ViewMode>('grid');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [groupByMap, setGroupByMap] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  /** A work entry being renamed / re-covered (`EditProjectDialog` needs a `Project`). */
  const [editProject, setEditProject] = useState<MapEntrySummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MapEntrySummary | null>(null);

  useEffect(() => {
    // SPEC-O19 (docs/v0.5.4.md §4): 工坊 is the **header suffix** only — the
    // page itself keeps speaking 地图.
    document.title = '地图 · 格物';
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setKeyword(keywordInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [keywordInput]);

  const params = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      keyword: keyword || undefined,
      sort,
      order: 'desc' as const,
    }),
    [page, keyword, sort],
  );

  const { data, isLoading, isError, error, refetch, isFetching } = useMaps(params);
  const deleteMutation = useDeleteMap();
  const deleteVersionMutation = useDeleteVersion();
  const duplicateMutation = useDuplicateMap();

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  /**
   * The two view-only controls run on the fetched page: filtering by kind
   * narrows what this page shows (the footer still reports the whole list), and
   * grouping re-orders it by blood lineage with the work entry first.
   */
  const entries = useMemo(() => {
    const list = data?.list ?? [];
    const filtered =
      kindFilter === 'all' ? list : list.filter((entry) => entry.kind === kindFilter);
    if (!groupByMap) return filtered;
    const rank = (entry: MapEntrySummary): number =>
      entry.kind === 'draft' ? 0 : 1;
    return [...filtered].sort(
      (a, b) =>
        a.rootId - b.rootId ||
        rank(a) - rank(b) ||
        (b.versionNo ?? 0) - (a.versionNo ?? 0),
    );
  }, [data?.list, kindFilter, groupByMap]);

  const isVersionEntry = (entry: MapEntrySummary): boolean => entry.kind === 'version';

  const handleOpen = (entry: MapEntrySummary): void => {
    navigate(`/editor/${entry.projectId}`);
  };

  /**
   * v0.5.8 §2: 两类条目共用「预览」—— 版本条目预览自己，工作条目预览血统里
   * 最新的已发布版本；从没发布过的工作条目在 UI 上就是禁用的。
   */
  const handlePreview = (entry: MapEntrySummary): void => {
    const versionNo = entry.versionNo ?? entry.currentVersionNo;
    if (versionNo === null) return;
    navigate(`/maps/${entry.projectId}/${versionNo}/view`);
  };

  const confirmDelete = (): void => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    if (isVersionEntry(target)) {
      // §7.1 第 4 条: deleting a version entry removes that `map_versions` row.
      deleteVersionMutation.mutate(
        { id: target.projectId, versionNo: target.versionNo ?? 0 },
        { onSuccess: () => setDeleteTarget(null) },
      );
      return;
    }
    deleteMutation.mutate(target.projectId, { onSuccess: () => setDeleteTarget(null) });
  };

  const deleting = deleteMutation.isPending || deleteVersionMutation.isPending;

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
          <Button variant="outline" onClick={() => void refetch()}>
            重试
          </Button>
        </Card>
      );
    }

    if (entries.length === 0) {
      return (
        <Card className="flex flex-col items-center gap-3 p-12 text-center">
          <p className="text-sm text-muted-foreground">
            {keyword
              ? '没有匹配的地图'
              : kindFilter === 'version'
                ? '还没有已发布的版本，在地图编辑器里发布一个试试'
                : '还没有地图，创建一个开始吧'}
          </p>
          {kindFilter === 'version' ? null : (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1 h-4 w-4" />
              新建地图
            </Button>
          )}
        </Card>
      );
    }

    if (view === 'list') {
      return (
        <Card className="overflow-hidden">
          {entries.map((entry) => (
            <ProjectListRow
              key={`${entry.kind}-${entry.id}`}
              entry={entry}
              onOpen={handleOpen}
              onRename={setEditProject}
              onDuplicate={(item) => duplicateMutation.mutate(item.projectId)}
              onDelete={setDeleteTarget}
              onPreview={handlePreview}
            />
          ))}
        </Card>
      );
    }

    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {entries.map((entry) => (
          <ProjectGridCard
            key={`${entry.kind}-${entry.id}`}
            entry={entry}
            onOpen={handleOpen}
            onRename={setEditProject}
            onDuplicate={(item) => duplicateMutation.mutate(item.projectId)}
            onDelete={setDeleteTarget}
            onPreview={handlePreview}
          />
        ))}
      </div>
    );
  }

  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          {/* SPEC-O19: 工坊 lives in the header wordmark, not here. */}
          <h1 className="text-2xl font-semibold">地图</h1>
          <p className="text-sm text-muted-foreground">创建、管理并编辑你的地图。</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          新建地图
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={keywordInput}
            onChange={(event) => setKeywordInput(event.target.value)}
            placeholder="搜索地图名称"
            className="pl-9"
          />
        </div>
        <select
          value={sort}
          onChange={(event) => {
            setSort(event.target.value as SortOption);
            setPage(1);
          }}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="updatedAt">按更新时间</option>
          <option value="name">按名称</option>
        </select>
        {/* §7.1 第 3 条：三态筛选（默认「全部」）*/}
        <select
          value={kindFilter}
          onChange={(event) => setKindFilter(event.target.value as KindFilter)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title="条目类型"
        >
          <option value="all">全部条目</option>
          <option value="draft">只看工作条目</option>
          <option value="version">只看版本条目</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={groupByMap}
            onChange={(event) => setGroupByMap(event.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          按地图归组
        </label>
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

      {!isLoading && !isError && total > 0 ? (
        <div className="flex items-center justify-end gap-3 text-sm text-muted-foreground">
          <span>
            第 {page} / {totalPages} 页 · 共 {total} 个
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            上一页
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
          >
            下一页
          </Button>
        </div>
      ) : null}

      <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} />
      <EditProjectDialog project={editProject} onOpenChange={(open) => !open && setEditProject(null)} />

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
                ? `删除地图版本 v${deleteTarget.versionNo ?? ''}？`
                : `删除地图「${deleteTarget?.name}」？`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && isVersionEntry(deleteTarget)
                ? '该版本条目将被永久删除，引用它的谜题会失去这个画布版本。'
                : '将同时删除画布上的所有物品与区域，不可恢复。'}
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
    </section>
  );
}
