import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, Map as MapIcon } from 'lucide-react';
import { toast } from 'sonner';
import {
  PUZZLE_DESCRIPTION_MAX_LENGTH,
  PUZZLE_NAME_MAX_LENGTH,
  type PublishedMapVersion,
} from '@loredoku/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCreatePuzzle } from '@/hooks/usePuzzles';
import { usePublishedVersions } from '@/hooks/useMaps';
import { formatDateTimeMinute } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * FEAT-K03 (docs/v0.5.0.md §2.4): the 「新建谜题」 dialog. Three fields —
 * 名称 (required) / 描述 (optional) / 地图版本 (required).
 *
 * The 地图版本 picker lists **published** map versions and nothing else: a
 * puzzle draws on a frozen snapshot, so an unpublished work entry has no canvas
 * to reference yet. Selecting one pins the canvas size (`n × n`), which is why
 * the dialog says so out loud before the puzzle exists.
 *
 * `?new={projectId}:{versionNo}` (from the map list's version entries, §7.1) is
 * read here so 「以此版本新建谜题」 arrives with the version already picked.
 */
export function CreatePuzzleDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): JSX.Element {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const versionsQuery = usePublishedVersions();
  const create = useCreatePuzzle((id) => {
    onOpenChange(false);
    navigate(`/puzzles/${id}/edit`);
  });

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const versions = useMemo(() => versionsQuery.data ?? [], [versionsQuery.data]);

  /** `{projectId}:{versionNo}` — the identity of one published version. */
  const keyOf = (version: PublishedMapVersion): string =>
    `${version.projectId}:${version.versionNo}`;

  const selected = useMemo(
    () => versions.find((version) => keyOf(version) === selectedKey) ?? null,
    [versions, selectedKey],
  );

  // Every open starts clean; `?new=` pre-picks the version when it exists.
  useEffect(() => {
    if (!open) return;
    setName('');
    setDescription('');
    setSelectedKey(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const preset = searchParams.get('new');
    if (!preset) return;
    if (versions.some((version) => keyOf(version) === preset)) setSelectedKey(preset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, searchParams, versions]);

  const canSubmit = name.trim().length > 0 && selected !== null && !create.isPending;

  const submit = (): void => {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      toast.error('请填写谜题名称');
      return;
    }
    if (!selected) {
      toast.error('请选择一个已发布的地图版本');
      return;
    }
    const trimmedDescription = description.trim();
    create.mutate({
      name: trimmed,
      description: trimmedDescription.length > 0 ? trimmedDescription : undefined,
      mapProjectId: selected.projectId,
      mapVersionNo: selected.versionNo,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>新建谜题</DialogTitle>
          <DialogDescription>
            谜题引用一个已发布的地图版本作为画布，参与者与联动主题色由谜题自己持有。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="create-puzzle-name">名称</Label>
            <Input
              id="create-puzzle-name"
              value={name}
              maxLength={PUZZLE_NAME_MAX_LENGTH}
              placeholder="例如：午夜花园"
              disabled={create.isPending}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="create-puzzle-description">描述（选填）</Label>
            <Textarea
              id="create-puzzle-description"
              value={description}
              rows={3}
              maxLength={PUZZLE_DESCRIPTION_MAX_LENGTH}
              placeholder="一句话说明这个谜题的玩法或背景"
              disabled={create.isPending}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <span className="text-sm font-medium">地图版本</span>
            {versionsQuery.isLoading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                正在加载已发布的地图版本…
              </div>
            ) : versions.length === 0 ? (
              <div className="space-y-2 rounded-md border border-dashed bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">
                  还没有已发布的地图版本，请先到「地图」里发布一个版本。
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => navigate('/projects')}
                >
                  <MapIcon className="mr-1 h-3.5 w-3.5" />
                  前往地图
                </Button>
              </div>
            ) : (
              <ul className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-1">
                {versions.map((version) => {
                  const key = keyOf(version);
                  const checked = key === selectedKey;
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        aria-pressed={checked}
                        disabled={create.isPending}
                        onClick={() => setSelectedKey(key)}
                        className={cn(
                          'w-full rounded px-2 py-1.5 text-left text-xs transition-colors',
                          checked ? 'bg-secondary text-secondary-foreground' : 'hover:bg-accent',
                        )}
                      >
                        <span className="flex items-center gap-1.5">
                          <span className="truncate font-medium">{version.mapName}</span>
                          <span className="shrink-0 rounded bg-background px-1.5 py-0.5 text-[11px] tabular-nums">
                            v{version.versionNo}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                          {version.gridSize}×{version.gridSize} · 发布于{' '}
                          {formatDateTimeMinute(version.publishedAt)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {selected ? (
              <p className="text-[11px] text-muted-foreground">
                画布尺寸 {selected.gridSize}×{selected.gridSize} 由所选地图版本决定，创建后不可修改。
              </p>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            disabled={create.isPending}
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button disabled={!canSubmit} onClick={submit}>
            {create.isPending ? '创建中…' : '创建'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
