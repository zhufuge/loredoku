import { History, Loader2, RotateCcw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useCreateDraftFromVersion, useVersions } from '@/hooks/useVersions';
import { formatDateTime } from '@/lib/format';

interface VersionHistoryDialogProps {
  projectId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentVersionNo: number | null;
}

export function VersionHistoryDialog({
  projectId,
  open,
  onOpenChange,
  currentVersionNo,
}: VersionHistoryDialogProps): JSX.Element {
  const versionsQuery = useVersions(open ? projectId : null);
  const createDraft = useCreateDraftFromVersion();

  const versions = versionsQuery.data ?? [];

  const revert = (versionNo: number): void => {
    createDraft.mutate(
      { id: projectId, versionNo },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            版本历史
          </DialogTitle>
          <DialogDescription>
            回滚会用所选版本覆盖当前草稿（含未保存的修改）。
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
          <p className="py-10 text-center text-sm text-muted-foreground">暂无发布版本</p>
        ) : (
          <ul className="max-h-80 space-y-2 overflow-y-auto">
            {versions.map((version) => (
              <li
                key={version.id}
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
                    {version.notes ? ` · ${version.notes}` : ''}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={createDraft.isPending}
                  onClick={() => revert(version.versionNo)}
                >
                  <RotateCcw className="mr-1 h-3.5 w-3.5" />
                  回滚
                </Button>
              </li>
            ))}
          </ul>
        )}

        {versionsQuery.isError ? (
          <p className="text-center text-xs text-muted-foreground">
            无法加载版本列表，请稍后重试。
          </p>
        ) : null}

        {createDraft.isPending ? (
          <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            正在回滚…
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
