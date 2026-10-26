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
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  CreateMapDialog,
  EditMapDialog,
} from '@/components/map/MapFormDialogs';
import { MapGridCard } from '@/components/map/MapGridCard';
import { MapListRow } from '@/components/map/MapListRow';
import { entryPreviewable } from '@/components/common/EntryActionsMenu';
import { useDeleteMap, useDuplicateMap, useMaps } from '@/hooks/useMaps';
import { useDeleteVersion } from '@/hooks/useVersions';

const PAGE_SIZE = 12;

/**
 * 视图选择持久化。网格 / 列表是纯展示偏好，刷新后应保持
 * （同 `MapViewPage` 的标尺开关，RULER_STORAGE_KEY 模式）。
 */
const VIEW_STORAGE_KEY = 'loredoku.maps.view';

type ViewMode = 'grid' | 'list';

function readStoredView(): ViewMode {
  if (typeof window === 'undefined') return 'grid';
  return window.localStorage.getItem(VIEW_STORAGE_KEY) === 'list' ? 'list' : 'grid';
}
type SortOption = 'updatedAt' | 'name';

/**
 * 列表正文拆「草稿」「版本」两块（设计 §17）：分块天然实现「只看草稿 / 只看
 * 版本」，工具栏只剩关键词 / 排序 / 视图切换。
 *
 * **两块各自分页**：同一端点带 `kind` 发两个请求，各带自己的页号与 `total`，
 * 两块各有翻页条。并集分页时期两块共享一页，版本密集时某一页可能只出现版本
 * 块、草稿全在别页，页码也对不上任何一块。
 *
 * 排序两块共用一套（`sort` / `order`，在服务端）；默认按更新时间倒序，所以
 * 刚发布的版本在最上面。要看同一张图的各版本，用搜索框筛名称。
 *
 * FEAT-K09 (docs/v0.5.0.md §7.1): the map list is the **union of work entries
 * and version entries**, so the response is `PaginatedData<MapEntrySummary>`.
 */
export function MapsPage(): JSX.Element {
  const navigate = useNavigate();
  const [draftPage, setDraftPage] = useState(1);
  const [versionPage, setVersionPage] = useState(1);
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [sort, setSort] = useState<SortOption>('updatedAt');
  const [view, setView] = useState<ViewMode>(readStoredView);
  const [createOpen, setCreateOpen] = useState(false);
  /** A work entry being renamed / re-covered (`EditMapDialog` needs a `MapEntry`). */
  const [editMapEntry, setEditMapEntry] = useState<MapEntrySummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MapEntrySummary | null>(null);

  useEffect(() => {
    document.title = '地图 · 格物';
  }, []);

  useEffect(() => {
    // 视图偏好落 localStorage，下次进页面还是它。
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

  const draftQuery = useMaps({ ...shared, kind: 'draft', page: draftPage });
  const versionQuery = useMaps({ ...shared, kind: 'version', page: versionPage });
  const deleteMutation = useDeleteMap();
  const deleteVersionMutation = useDeleteVersion();
  const duplicateMutation = useDuplicateMap();

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

  /**
   * 删完当页最后一条时页号会越过新的总页数 —— 收敛到最后一页，否则用户看到
   * 空白块还以为数据没了。
   */
  useEffect(() => {
    if (draftPage > draftPages) setDraftPage(draftPages);
  }, [draftPage, draftPages]);

  useEffect(() => {
    if (versionPage > versionPages) setVersionPage(versionPages);
  }, [versionPage, versionPages]);

  const isVersionEntry = (entry: MapEntrySummary): boolean => entry.kind === 'version';

  /**
   * 封面 / 名称的主点击：工作条目进编辑器。**版本条目不从这里走** —— v0.7.2
   * 起版本行的封面 / 名称是「预览」（见 `MapListRow`），改版本走独立的「编辑」
   * 按钮（{@link handleEdit}）。
   */
  const handleOpen = (entry: MapEntrySummary): void => {
    navigate(`/maps/${entry.mapId}/edit`);
  };

  /**
   * v0.7.2 §5：版本条目的「编辑」= 带 `?v=` 进编辑器的 fork 态 —— 进去**不建
   * 行**，点保存才 fork 出新草稿。
   */
  const handleEdit = (entry: MapEntrySummary): void => {
    if (entry.kind === 'version' && entry.versionNo !== null) {
      navigate(`/maps/${entry.mapId}/edit?v=${entry.versionNo}`);
      return;
    }
    navigate(`/maps/${entry.mapId}/edit`);
  };

  /**
   * 预览统一去 `/maps/:id/views`，一条 URL 只由 `:mapId` 决定看什么：
   * 草稿条目看草稿自己的画布，版本条目看自己那一行。没有 `?v=`。
   */
  const handlePreview = (entry: MapEntrySummary): void => {
    if (!entryPreviewable(entry)) return;
    navigate(`/maps/${entry.mapId}/views`);
  };

  const confirmDelete = (): void => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    if (isVersionEntry(target)) {
      deleteVersionMutation.mutate(
        { id: target.mapId, versionNo: target.versionNo ?? 0 },
        { onSuccess: () => setDeleteTarget(null) },
      );
      return;
    }
    deleteMutation.mutate(target.mapId, { onSuccess: () => setDeleteTarget(null) });
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
        {draftTotal > 0 ? (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">
              草稿 <span className="ml-1 font-normal text-muted-foreground">{draftTotal}</span>
            </h2>
            {/* v0.7.8 §10：网格最多 4 列 —— 撤掉了 `2xl:grid-cols-5`。正文上限是
                `max-w-7xl`（1280），再加一列只会让卡片随窗口变宽而变窄（296 → 234）。 */}
            {view === 'list' ? (
              <Card className="overflow-hidden">
                {drafts.map((entry) => (
                  <MapListRow
                    key={`${entry.kind}-${entry.id}`}
                    entry={entry}
                    onOpen={handleOpen}
                    onEdit={handleEdit}
                    onRename={setEditMapEntry}
                    onDuplicate={(item) => duplicateMutation.mutate(item.mapId)}
                    onDelete={setDeleteTarget}
                    onPreview={handlePreview}
                  />
                ))}
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {drafts.map((entry) => (
                  <MapGridCard
                    key={`${entry.kind}-${entry.id}`}
                    entry={entry}
                    onOpen={handleOpen}
                    onEdit={handleEdit}
                    onRename={setEditMapEntry}
                    onDuplicate={(item) => duplicateMutation.mutate(item.mapId)}
                    onDelete={setDeleteTarget}
                    onPreview={handlePreview}
                  />
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
                <MapListRow
                  key={`${entry.kind}-${entry.id}`}
                  entry={entry}
                  onOpen={handleOpen}
                  onEdit={handleEdit}
                  onRename={setEditMapEntry}
                  onDuplicate={(item) => duplicateMutation.mutate(item.mapId)}
                  onDelete={setDeleteTarget}
                  onPreview={handlePreview}
                />
              ))}
            </Card>
            {renderPager(versionPage, versionPages, versionTotal, setVersionPage)}
          </section>
        ) : null}
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <PageHeader
        title="地图"
        description="创建、管理并编辑你的地图。"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            新建地图
          </Button>
        }
      />

      {/* v0.7.8 §10：工具条从属于列表，所以和列表一起构成「正文」这一块 ——
          页头到正文 24px，工具条到列表 16px。原来三块间距一样（都是 20px），
          层级读不出来。 */}
      <div className="space-y-4">
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
          {/* v0.7.8 §4：外框 `h-10` 与搜索框、下拉同高；按钮 32px 居中在 40px 框内。
              原来是 `size="icon"`（40px）+ `p-1`，整块比相邻控件高出 8px。 */}
          <div className="ml-auto flex h-10 items-center gap-1 rounded-md border px-1">
            <Button
              size="icon"
              className="h-8 w-8"
              variant={view === 'grid' ? 'secondary' : 'ghost'}
              title="网格视图"
              onClick={() => setView('grid')}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              className="h-8 w-8"
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
      </div>

      <CreateMapDialog open={createOpen} onOpenChange={setCreateOpen} />
      <EditMapDialog mapEntry={editMapEntry} onOpenChange={(open) => !open && setEditMapEntry(null)} />

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
