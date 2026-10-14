import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutGrid, List, Loader2, Plus, Search } from 'lucide-react';
import type { ProjectDetail } from '@murdoku/shared';
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
import { useDeleteProject, useDuplicateProject, useProjects } from '@/hooks/useProjects';

const PAGE_SIZE = 12;

type ViewMode = 'grid' | 'list';
type SortOption = 'updatedAt' | 'name';

export function ProjectsPage(): JSX.Element {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [sort, setSort] = useState<SortOption>('updatedAt');
  const [view, setView] = useState<ViewMode>('grid');
  const [createOpen, setCreateOpen] = useState(false);
  const [editProject, setEditProject] = useState<ProjectDetail | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectDetail | null>(null);

  useEffect(() => {
    document.title = '地图 · Murdoku Maker';
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

  const { data, isLoading, isError, error, refetch, isFetching } = useProjects(params);
  const deleteMutation = useDeleteProject();
  const duplicateMutation = useDuplicateProject();

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const projects = data?.list ?? [];

  const handleOpen = (project: ProjectDetail): void => {
    navigate(`/editor/${project.id}`);
  };

  const confirmDelete = (): void => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) });
  };

  const deleting = deleteMutation.isPending;

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

    if (projects.length === 0) {
      return (
        <Card className="flex flex-col items-center gap-3 p-12 text-center">
          <p className="text-sm text-muted-foreground">
            {keyword ? '没有匹配的项目' : '还没有项目，创建一个开始吧'}
          </p>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            新建项目
          </Button>
        </Card>
      );
    }

    if (view === 'list') {
      return (
        <Card className="overflow-hidden">
          {projects.map((project) => (
            <ProjectListRow
              key={project.id}
              project={project}
              onOpen={handleOpen}
              onRename={setEditProject}
              onDuplicate={(item) => duplicateMutation.mutate(item.id)}
              onDelete={setDeleteTarget}
            />
          ))}
        </Card>
      );
    }

    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {projects.map((project) => (
          <ProjectGridCard
            key={project.id}
            project={project}
            onOpen={handleOpen}
            onRename={setEditProject}
            onDuplicate={(item) => duplicateMutation.mutate(item.id)}
            onDelete={setDeleteTarget}
          />
        ))}
      </div>
    );
  }

  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">地图</h1>
          <p className="text-sm text-muted-foreground">创建、管理并编辑你的地图。</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          新建项目
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={keywordInput}
            onChange={(event) => setKeywordInput(event.target.value)}
            placeholder="搜索项目名称"
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
            <AlertDialogTitle>删除项目「{deleteTarget?.name}」？</AlertDialogTitle>
            <AlertDialogDescription>
              将同时删除画布上的所有卡片与区域，不可恢复。
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
