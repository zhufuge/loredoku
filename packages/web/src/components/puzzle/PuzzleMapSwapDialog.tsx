import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Map as MapIcon } from 'lucide-react';
import { toast } from 'sonner';
import type { PublishedMapVersion } from '@loredoku/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { usePublishedVersions } from '@/hooks/useMaps';
import { formatDateTimeMinute } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * v0.7.3 §3：「引入新地图」。
 *
 * 只列**方格尺寸与当前底图相同**的已发布地图版本，并且排除当前这一份：
 *
 * - 尺寸必须相同是硬约束 —— 底图尺寸决定名册长度与所有格子坐标，换尺寸等于换
 *   坐标系（那是「新建谜题」的事）；
 * - 只收已发布版本 —— 冻结快照才能被复制走，草稿随时会变。
 *
 * 选中之后只换底图（画布 / 地图名 / 版本号），谜题自己的字段一概不动。
 */
interface PuzzleMapSwapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 当前底图 —— 用来过滤与显示。 */
  current: { mapId: number; versionNo: number; mapName: string; gridSize: number } | null;
  onConfirm: (version: PublishedMapVersion) => void;
  /** 正在取新版本的画布。 */
  busy?: boolean;
}

export function PuzzleMapSwapDialog({
  open,
  onOpenChange,
  current,
  onConfirm,
  busy = false,
}: PuzzleMapSwapDialogProps): JSX.Element {
  const versionsQuery = usePublishedVersions();
  const navigate = useNavigate();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const keyOf = (version: PublishedMapVersion): string =>
    `${version.mapId}:${version.versionNo}`;

  /** 同尺寸、且不是当前这一份。 */
  const candidates = useMemo(() => {
    const all = versionsQuery.data ?? [];
    if (!current) return [];
    return all.filter(
      (version) =>
        version.gridSize === current.gridSize &&
        !(version.mapId === current.mapId && version.versionNo === current.versionNo),
    );
  }, [versionsQuery.data, current]);

  const selected = useMemo(
    () => candidates.find((version) => keyOf(version) === selectedKey) ?? null,
    [candidates, selectedKey],
  );

  // 每次打开都从「没选」开始。
  useEffect(() => {
    if (open) setSelectedKey(null);
  }, [open]);

  const gridSize = current?.gridSize ?? 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>引入新地图</DialogTitle>
          <DialogDescription>
            只替换底图画布与地图名称；参与者、线索、联动主题色、描述保持不变。
            新地图上不存在的联动目标会被移除（可撤销）。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs">
            <span className="text-muted-foreground">当前底图：</span>
            <span className="font-medium">{current?.mapName || '未命名地图'}</span>
            <span className="ml-1 tabular-nums text-muted-foreground">
              v{current?.versionNo ?? 0} · {gridSize}×{gridSize}
            </span>
          </div>

          {versionsQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在加载已发布的地图版本…
            </div>
          ) : candidates.length === 0 ? (
            <div className="space-y-2 rounded-md border border-dashed bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">
                没有其他 {gridSize}×{gridSize} 的已发布地图版本。尺寸不同的地图不能用来替换底图。
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  navigate('/maps');
                }}
              >
                <MapIcon className="mr-1 h-3.5 w-3.5" />
                前往地图发布
              </Button>
            </div>
          ) : (
            <ul className="max-h-60 space-y-1 overflow-y-auto rounded-md border p-1">
              {candidates.map((version) => {
                const key = keyOf(version);
                const checked = key === selectedKey;
                return (
                  <li key={key}>
                    <button
                      type="button"
                      aria-pressed={checked}
                      disabled={busy}
                      onClick={() => setSelectedKey(key)}
                      className={cn(
                        'w-full rounded px-2 py-1.5 text-left text-xs transition-colors',
                        checked ? 'bg-secondary text-secondary-foreground' : 'hover:bg-accent',
                      )}
                    >
                      <span className="flex items-center gap-1.5">
                        <span className="truncate font-medium">{version.mapName}</span>
                        <span className="shrink-0 rounded bg-background px-1.5 py-0.5 text-2xs tabular-nums">
                          v{version.versionNo}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-2xs text-muted-foreground">
                        {version.gridSize}×{version.gridSize} · 发布于{' '}
                        {formatDateTimeMinute(version.publishedAt)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            disabled={busy || !selected}
            onClick={() => {
              if (!selected) {
                toast.error('请选择一个已发布的地图版本');
                return;
              }
              onConfirm(selected);
            }}
          >
            {busy ? (
              <>
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                引入中…
              </>
            ) : (
              '引入'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
