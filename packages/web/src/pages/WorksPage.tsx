import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Eye, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import type { MapVersionSummary } from '@murdoku/shared';
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
import { Select } from '@/components/ui/select';
import { useProjects } from '@/hooks/useProjects';
import {
  useCreateDraftFromVersion,
  useDeleteVersion,
  useVersions,
  sortWorks,
} from '@/hooks/useVersions';
import { formatDateTime } from '@/lib/format';

const ALL_PROJECTS = 'all';

export function WorksPage(): JSX.Element {
  const navigate = useNavigate();
  const [projectId, setProjectId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MapVersionSummary | null>(null);

  const projectsQuery = useProjects({ page: 1, pageSize: 100, sort: 'updatedAt' });
  const projects = projectsQuery.data?.list ?? [];

  useEffect(() => {
    document.title = '作品 · Murdoku Maker';
  }, []);

  // Default to the most recently updated map.
  useEffect(() => {
    if (projectId !== null || projects.length === 0) return;
    setProjectId(projects[0]!.id);
  }, [projects, projectId]);

  const worksQuery = useVersions(projectId);
  const createDraft = useCreateDraftFromVersion();
  const deleteWork = useDeleteVersion();

  const works = useMemo(() => sortWorks(worksQuery.data ?? []), [worksQuery.data]);

  const exportWork = (work: MapVersionSummary): void => {
    if (projectId === null) return;
    void (async () => {
      const { versionsApi } = await import('@/api/versions');
      const detail = await versionsApi.detail(projectId, work.versionNo);
      const blob = new Blob([JSON.stringify(detail.data, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const projectName = projects.find((item) => item.id === projectId)?.name ?? 'map';
      anchor.href = url;
      anchor.download = `${projectName}-v${work.versionNo}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    })();
  };

  const confirmDelete = (): void => {
    if (!deleteTarget || projectId === null) return;
    const target = deleteTarget;
    // OPT-210: keep the dialog open until the request settles.
    deleteWork.mutate(
      { id: projectId, versionNo: target.versionNo },
      { onSettled: () => setDeleteTarget(null) },
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">作品管理</h1>
          <p className="text-xs text-muted-foreground">
            已发布的地图快照，可预览效果、导出或回滚为草稿。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">地图</span>
          <Select
            className="h-9 w-56"
            value={projectId === null ? ALL_PROJECTS : String(projectId)}
            onChange={(event) =>
              setProjectId(
                event.target.value === ALL_PROJECTS ? null : Number(event.target.value),
              )
            }
          >
            <option value={ALL_PROJECTS}>全部（请选择地图）</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">作品列表</h2>

        {projectsQuery.isLoading || worksQuery.isLoading ? (
          <div className="flex items-center justify-center gap-2 rounded-lg border py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在加载作品…
          </div>
        ) : worksQuery.isError ? (
          <p className="rounded-lg border py-12 text-center text-sm text-muted-foreground">
            作品加载失败
          </p>
        ) : works.length === 0 ? (
          <p className="rounded-lg border py-12 text-center text-sm text-muted-foreground">
            暂无作品，发布一个试试
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {works.map((work) => (
              <li key={work.id} className="space-y-2 p-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">v{work.versionNo}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(work.publishedAt)}
                  </span>
                  <span className="rounded bg-secondary px-1.5 py-0.5 text-[11px] text-secondary-foreground">
                    {work.gridSize} × {work.gridSize}
                  </span>
                  {work.notes ? (
                    <span className="truncate text-xs text-muted-foreground">{work.notes}</span>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span>参与者 {work.participantCount}</span>
                  <span>区域 {work.regionCount}</span>
                  <span>物品 {work.itemCount}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={() =>
                      navigate(
                        `/works/${work.id}/view?project=${projectId ?? ''}&v=${work.versionNo}`,
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
                      projectId !== null &&
                      createDraft.mutate({ id: projectId, versionNo: work.versionNo })
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
              </li>
            ))}
          </ul>
        )}
      </section>

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
    </div>
  );
}
