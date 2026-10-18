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

/**
 * v0.5.9 §5: 视图选择持久化。网格 / 列表是纯展示偏好，刷新后应保持
 * （同 `MapVersionViewPage` 的标尺开关，RULER_STORAGE_KEY 模式）。
 */
const VIEW_STORAGE_KEY = 'loredoku.maps.view';

type ViewMode = 'grid' | 'list';

function readStoredView(): ViewMode {
  if (typeof window === 'undefined') return 'grid';
  return window.localStorage.getItem(VIEW_STORAGE_KEY) === 'list' ? 'list' : 'grid';
}
type SortOption = 'updatedAt' | 'name';

/**
 * v0.5.8 §15 / 设计 §17: 列表正文拆「草稿」「版本」两块 —— 分块天然实现原来
 * 三态 kind 筛选的用途，版本块按 `rootId asc, versionNo desc` 排序又吸收了
 * 「按地图归组」，于是两个纯视图控件一并删除。
 *
 * v0.5.0 FEAT-K09 (docs/v0.5.0.md §7.1): the map list is the **union of work
 * entries and version entries**, so `useMaps` answers with
 * `PaginatedData<MapEntrySummary>` instead of `ProjectDetail[]`. 分块只作用于
 * 当前页（分页仍是并集口径）。
 */
export function MapsPage(): JSX.Element {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [sort, setSort] = useState<SortOption>('updatedAt');
  const [view, setView] = useState<ViewMode>(readStoredView);
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
    // v0.5.9 §5: 视图偏好落 localStorage，下次进页面还是它。
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(VIEW_STORAGE_KEY, view);
    }
  }, [view]);

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
   * v0.5.8 §15: 按 kind 分两块。草稿沿用后端序（`updated_at` 倒序 / 名称序）；
   * 版本块固定 `rootId asc, versionNo desc` —— 同血统相邻、新号在上，这是原来
   * 「按地图归组」的排序，现在成了版本块的常态。分页仍是并集分页，两块共享
   * 当前页（某页可能只出现一块）。
   */
  const { drafts, versions } = useMemo(() => {
    const list = data?.list ?? [];
    return {
      drafts: list.filter((entry) => entry.kind === 'draft'),
      versions: list
        .filter((entry) => entry.kind === 'version')
        .sort((a, b) => a.rootId - b.rootId || (b.versionNo ?? 0) - (a.versionNo ?? 0)),
    };
  }, [data?.list]);

  const isVersionEntry = (entry: MapEntrySummary): boolean => entry.kind === 'version';

  /**
   * v0.5.8 §13: 主点击按 kind 分叉 —— 工作条目进编辑器；版本条目走「以此为
   * 底稿新建」：同样进编辑器，但带 `?v={n}`，画布装的是**版本快照**，且
   * **保存时才生成草稿**（fork）。v0.5.8 里两者都去编辑器且同一个 id，
   * 点哪条展出的都是地图草稿（「maps 内容覆盖 version 内容」）；v0.5.9 一度
   * 改成进只读预览，但那样「基于旧版本继续改」就断了入口，只读预览留给
   * 菜单 / 列表里的「预览」图标。
   */
  const handleOpen = (entry: MapEntrySummary): void => {
    if (entry.kind === 'version' && entry.versionNo !== null) {
      navigate(`/maps/${entry.projectId}/edit?v=${entry.versionNo}`);
      return;
    }
    navigate(`/maps/${entry.projectId}/edit`);
  };

  /**
   * v0.5.9 §7: 预览统一去 `/maps/:id/views`，具体版本走 `?v=` query ——
   * 版本条目看自己，工作条目看血统里最新的已发布版本；从没发布过的工作
   * 条目在 UI 上就是禁用的。
   */
  const handlePreview = (entry: MapEntrySummary): void => {
    const versionNo = entry.versionNo ?? entry.currentVersionNo;
    if (versionNo === null) return;
    navigate(`/maps/${entry.projectId}/views?v=${versionNo}`);
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
          <Button variant="outline" onClick={() => void refetch()}>
            重试
          </Button>
        </Card>
      );
    }

    if (drafts.length === 0 && versions.length === 0) {
      return (
        <Card className="flex flex-col items-center gap-3 p-12 text-center">
          <p className="text-sm text-muted-foreground">
            {keyword ? '没有匹配的地图' : '还没有地图，创建一个开始吧'}
          </p>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            新建地图
          </Button>
        </Card>
      );
    }

    return (
      <div className="space-y-8">
        {drafts.length > 0 ? (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">
              草稿 <span className="ml-1 font-normal text-muted-foreground">{drafts.length}</span>
            </h2>
            {view === 'list' ? (
              <Card className="overflow-hidden">
                {drafts.map((entry) => (
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
            ) : (
              // v0.5.9 §4: 最大一行 5 个（2xl），再宽也不铺满 —— 卡片封面要够大才认得出。
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {drafts.map((entry) => (
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
            )}
          </section>
        ) : null}

        {/* v0.5.8 §15: 版本块恒为列表行，不生成卡片 —— 视图切换只管草稿块。 */}
        {versions.length > 0 ? (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">
              版本 <span className="ml-1 font-normal text-muted-foreground">{versions.length}</span>
            </h2>
            <Card className="overflow-hidden">
              {versions.map((entry) => (
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
          </section>
        ) : null}
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
        {/* v0.5.8 §15: 三态 kind 筛选与「按地图归组」已删 —— 分块取代前者，
            版本块的固定排序吸收后者。 */}
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
