import { History, Loader2, Pencil, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useDeleteVersion, useForkVersion, useVersions } from '@/hooks/useVersions';
import { formatDateTime } from '@/lib/format';

interface VersionHistoryDialogProps {
  projectId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentVersionNo: number | null;
  /** SPEC-K13 §7.4: a version row's 「查看效果」 opens this read-only preview. */
  onPreview: (version: { projectId: number; versionNo: number }) => void;
}

/**
 * SPEC-K13 (docs/v0.5.0.md §7.4): the version rows of the **whole blood lineage**
 * (Q3 = B), each naming the `maps` row that owns it — that is what
 * 「编辑此版本」 forks from.
 *
 * 「回滚」 does not exist (§15 Q10): forking *is* "start from an old version", so
 * a rollback would be a second way to say the same thing — and the destructive
 * one, since it would overwrite the work-in-progress entry.
 *
 * A version row can be deleted from here.
 */
export function VersionHistoryDialog({
  projectId,
  open,
  onOpenChange,
  currentVersionNo,
  onPreview,
}: VersionHistoryDialogProps): JSX.Element {
  const versionsQuery = useVersions(open ? projectId : null);
  const fork = useForkVersion();
  const remove = useDeleteVersion();

  const versions = versionsQuery.data ?? [];
  const busy = fork.isPending || remove.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            版本历史
          </DialogTitle>
          <DialogDescription>
            本图历史上发布过的所有版本（含从别条条目继承来的）。「编辑此版本」会新增一个条目，
            不会改动这条版本。
          </DialogDescription>
        </DialogHeader>

        {versionsQuery.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在加载…
          </div>
        ) : versionsQuery.isError ? (
          <p className="py-10 text-center text-sm text-muted-foreground">版本加载失败</p>
        ) : versions.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            暂无版本，发布一个试试
          </p>
        ) : (
          <ul className="max-h-80 space-y-2 overflow-y-auto">
            {versions.map((version) => (
              <li
                key={`${version.projectId}-${version.id}`}
                className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">v{version.versionNo}</span>
                    {version.versionNo === currentVersionNo ? (
                      <span className="rounded bg-secondary px-1.5 py-0.5 text-[11px] text-secondary-foreground">
                        当前
                      </span>
                    ) : null}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {formatDateTime(version.publishedAt)}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {version.gridSize} × {version.gridSize} · 参与者 {version.participantCount} · 区域{' '}
                    {version.regionCount} · 物体 {version.itemCount}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      onPreview({ projectId: version.projectId, versionNo: version.versionNo })
                    }
                  >
                    查看效果
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    title="以此版本为起点新增一个条目"
                    onClick={() =>
                      fork.mutate(
                        { id: version.projectId, versionNo: version.versionNo },
                        { onSuccess: () => onOpenChange(false) },
                      )
                    }
                  >
                    <Pencil className="mr-1 h-3.5 w-3.5" />
                    编辑此版本
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    title="删除该版本"
                    disabled={busy}
                    onClick={() =>
                      remove.mutate({ id: version.projectId, versionNo: version.versionNo })
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {busy ? (
          <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            正在处理…
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
