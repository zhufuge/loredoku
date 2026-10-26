import { Loader2, Pencil, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { PuzzleEntrySummary } from '@loredoku/shared';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useDeletePuzzleVersion, usePuzzleVersions } from '@/hooks/usePuzzles';
import { formatDateTime } from '@/lib/format';

interface PuzzleVersionHistoryDialogProps {
  puzzleId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 当前草稿已经发布到的号 —— 版本行上会打「当前」徽标。 */
  currentVersionNo: number | null;
  /** 只读预览某个版本（路由只认 `:puzzleId`，所以交出这一行自己的 id）。 */
  onPreview: (version: PuzzleEntrySummary) => void;
}

/**
 * 谜题版本历史（v0.7.1 §5.5）：血统内所有活着的版本行，版本号倒序。
 *
 * 与地图的版本面板同一套动作：「编辑此版本」进编辑器 `?v=` 的 fork 态（v0.7.2
 * 起不再当场 fork —— 保存时才生成新草稿行）。删除会被服务端挡住：挂着未取消
 * 部署的游戏时返回 400「该版本已部署为游戏，请先取消部署」。
 */
export function PuzzleVersionHistoryDialog({
  puzzleId,
  open,
  onOpenChange,
  currentVersionNo,
  onPreview,
}: PuzzleVersionHistoryDialogProps): JSX.Element {
  const navigate = useNavigate();
  const versionsQuery = usePuzzleVersions(open ? puzzleId : null);
  const remove = useDeletePuzzleVersion();

  const versions = versionsQuery.data ?? [];
  const busy = remove.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>版本历史</DialogTitle>
          <DialogDescription>
            这个谜题发布过的所有版本（含从别条条目继承来的）。「编辑此版本」会新增一个条目，
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
                key={version.id}
                className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium tabular-nums">v{version.versionNo}</span>
                    {version.versionNo === currentVersionNo ? (
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-2xs text-primary">
                        当前
                      </span>
                    ) : null}
                    {version.deployed ? (
                      <span className="rounded bg-success/10 px-1.5 py-0.5 text-2xs text-success">
                        已部署
                      </span>
                    ) : null}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{version.name}</div>
                  <div className="text-2xs text-muted-foreground">
                    {formatDateTime(version.publishedAt ?? version.createdAt)} ·{' '}
                    {version.gridSize} × {version.gridSize}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => onPreview(version)}
                  >
                    查看效果
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    title="进入编辑器的版本态（保存时才生成新草稿）"
                    onClick={() => {
                      // v0.7.2 §3.5：和列表的「编辑」同一个副作用 —— 只进 `?v=`
                      // fork 态，不在这里提前建行。
                      onOpenChange(false);
                      navigate(`/puzzles/${version.id}/edit?v=${version.versionNo ?? 0}`);
                    }}
                  >
                    <Pencil className="mr-1 h-3.5 w-3.5" />
                    编辑此版本
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    title="删除该版本"
                    disabled={busy || version.deployed}
                    onClick={() =>
                      remove.mutate({ id: version.id, versionNo: version.versionNo ?? 0 })
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
