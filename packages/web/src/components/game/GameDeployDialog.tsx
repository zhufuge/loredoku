import { useEffect, useMemo, useRef, useState } from 'react';
import { ImagePlus, Rocket, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import {
  GAME_DIFFICULTY_COLORS,
  GAME_DIFFICULTY_DEFAULT,
  GAME_DIFFICULTY_LABELS,
  GAME_DIFFICULTY_LEVELS,
  GAME_NAME_MAX_LENGTH,
} from '@loredoku/shared';
import type { GameDifficulty, WorkSummary } from '@loredoku/shared';
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
import { useDeployGame } from '@/hooks/useGames';
import { cn } from '@/lib/utils';

const COVER_ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml';

/**
 * FEAT-G02 (docs/v0.4.0.md §5.2): the deploy dialog. The cover is staged in the
 * dialog and uploaded right after the game row is created, because the upload
 * endpoint targets the new game's id.
 */
export function GameDeployDialog({
  work,
  open,
  onOpenChange,
}: {
  work: WorkSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): JSX.Element {
  const deploy = useDeployGame();
  const [name, setName] = useState('');
  const [difficulty, setDifficulty] = useState<GameDifficulty>(GAME_DIFFICULTY_DEFAULT);
  const [cover, setCover] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Every open starts from the work's own defaults.
  useEffect(() => {
    if (!open || !work) return;
    setName(work.projectName);
    setDifficulty(GAME_DIFFICULTY_DEFAULT);
    setCover(null);
  }, [open, work]);

  const coverPreview = useMemo(
    () => (cover ? URL.createObjectURL(cover) : null),
    [cover],
  );
  useEffect(() => {
    if (!coverPreview) return;
    return () => URL.revokeObjectURL(coverPreview);
  }, [coverPreview]);

  const submit = (): void => {
    if (!work) return;
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      toast.error('请填写游戏名称');
      return;
    }
    deploy.mutate(
      {
        projectId: work.projectId,
        versionNo: work.versionNo,
        name: trimmed,
        difficulty,
        cover,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>部署为游戏</DialogTitle>
          <DialogDescription>
            {work
              ? `把作品「${work.projectName} v${work.versionNo}」部署为可玩的游戏。相同地图只能部署一个版本，再次部署将覆盖此前的游戏。`
              : '把已发布的作品部署为可玩的游戏。'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="game-deploy-name">
              游戏名称
            </label>
            <Input
              id="game-deploy-name"
              value={name}
              maxLength={GAME_NAME_MAX_LENGTH}
              placeholder="默认为作品名称"
              onChange={(event) => setName(event.target.value)}
              disabled={deploy.isPending}
            />
          </div>

          <div className="space-y-1.5">
            <span className="text-sm font-medium">封面图片</span>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  'flex h-24 w-32 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-md border-2 border-dashed border-input text-muted-foreground transition-colors hover:border-primary',
                )}
              >
                {coverPreview ? (
                  <img
                    src={coverPreview}
                    alt="封面预览"
                    draggable={false}
                    className="no-drag h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex flex-col items-center gap-1 text-xs">
                    <ImagePlus className="h-5 w-5" />
                    选择图片
                  </span>
                )}
              </button>
              <div className="flex flex-1 flex-col justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  支持 PNG / JPEG / WebP / SVG，≤ 2 MB。封面可留空。
                  {cover ? `已选择：${cover.name}` : ''}
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={deploy.isPending}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="mr-1 h-3.5 w-3.5" />
                    {cover ? '替换' : '上传'}
                  </Button>
                  {cover ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      disabled={deploy.isPending}
                      onClick={() => setCover(null)}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      移除
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={COVER_ACCEPT}
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setCover(file);
                event.target.value = '';
              }}
            />
          </div>

          <div className="space-y-1.5">
            <span className="text-sm font-medium">难度</span>
            <div className="flex flex-wrap gap-2">
              {GAME_DIFFICULTY_LEVELS.map((level) => (
                <button
                  key={level}
                  type="button"
                  aria-pressed={difficulty === level}
                  onClick={() => setDifficulty(level)}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-medium text-white transition-opacity',
                    difficulty === level
                      ? 'ring-2 ring-offset-2 ring-offset-background'
                      : 'opacity-60 hover:opacity-90',
                  )}
                  style={{
                    backgroundColor: GAME_DIFFICULTY_COLORS[level],
                    ...(difficulty === level
                      ? { boxShadow: `0 0 0 2px ${GAME_DIFFICULTY_COLORS[level]}` }
                      : {}),
                  }}
                >
                  {GAME_DIFFICULTY_LABELS[level]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            disabled={deploy.isPending}
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button disabled={deploy.isPending} onClick={submit}>
            <Rocket className="mr-1 h-3.5 w-3.5" />
            {deploy.isPending ? '部署中…' : '部署'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
