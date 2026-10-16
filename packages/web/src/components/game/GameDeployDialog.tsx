import { useEffect, useMemo, useRef, useState } from 'react';
import { ImagePlus, RefreshCw, Rocket, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import {
  GAME_DIFFICULTY_COLORS,
  GAME_DIFFICULTY_DEFAULT,
  GAME_DIFFICULTY_LABELS,
  GAME_DIFFICULTY_LEVELS,
  GAME_NAME_MAX_LENGTH,
  GAME_SLUG_MAX_LENGTH,
  buildDefaultSlug,
  normalizeSlugInput,
  slugError,
} from '@loredoku/shared';
import type { GameDifficulty, MapGameSummary, PuzzleSummary } from '@loredoku/shared';
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
 * FEAT-G02 (docs/v0.4.0.md §5.2) + v0.4.1 (docs/v0.4.1.md §3 / §4): the deploy
 * dialog. The cover is staged here and uploaded right after the game row is
 * created, because the upload endpoint targets the new game's id.
 *
 * v0.4.1 additions:
 * - OPT-W03: re-deploying prefills the difficulty and shows the current cover,
 *   with a three-way choice — keep it, replace it, or remove it;
 * - OPT-W04: the game's **access path** is a first-class field, defaulted to
 *   `puzzle-{name}-{difficulty}` and previewed as `/play/{value}`.
 *
 * v0.5.0 CONS-K16 (docs/v0.5.0.md §10.2): the deployed unit is a **puzzle**
 * now — one game per puzzle, so `puzzle_id` is what the request targets and
 * the default access path is built from the puzzle's name.
 */
export function GameDeployDialog({
  puzzle,
  existingGame,
  open,
  onOpenChange,
}: {
  puzzle: PuzzleSummary | null;
  /** OPT-W03: the puzzle's current game, used to prefill the re-deploy. */
  existingGame?: MapGameSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): JSX.Element {
  const deploy = useDeployGame();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [difficulty, setDifficulty] = useState<GameDifficulty>(GAME_DIFFICULTY_DEFAULT);
  const [cover, setCover] = useState<File | null>(null);
  /**
   * OPT-W03 §3: the cover has three states — keep the stored one (default),
   * replace it with `cover`, or drop it (`coverRemoved`).
   */
  const [coverRemoved, setCoverRemoved] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Every open starts from the puzzle's own defaults, or from the game's stored
  // values when this puzzle was deployed before (OPT-W03).
  useEffect(() => {
    if (!open || !puzzle) return;
    const startName = puzzle.name;
    const startDifficulty = existingGame?.difficulty ?? GAME_DIFFICULTY_DEFAULT;
    setName(startName);
    setDifficulty(startDifficulty);
    setCover(null);
    setCoverRemoved(false);
    if (existingGame) {
      // An already-published path is a promise to whoever holds the link, so it
      // is prefilled and treated as "done editing" — changing the name or the
      // difficulty will not silently rewrite it (docs/v0.4.1.md §4.2).
      setSlug(existingGame.slug);
      setSlugTouched(true);
    } else {
      setSlug(buildDefaultSlug({ name: startName, difficulty: startDifficulty }));
      setSlugTouched(false);
    }
  }, [open, puzzle, existingGame]);

  // OPT-W04 §4.2: while the author has not edited the path themselves, it
  // follows the name and the difficulty.
  useEffect(() => {
    if (!open || slugTouched) return;
    setSlug(buildDefaultSlug({ name, difficulty }));
  }, [open, slugTouched, name, difficulty]);

  const coverPreview = useMemo(
    () => (cover ? URL.createObjectURL(cover) : null),
    [cover],
  );
  useEffect(() => {
    if (!coverPreview) return;
    return () => URL.revokeObjectURL(coverPreview);
  }, [coverPreview]);

  /** OPT-W03: what the cover area shows right now — new file, stored, or none. */
  const storedCover = coverRemoved ? null : existingGame?.coverUrl ?? null;
  const showStoredCover = !cover && storedCover !== null;

  /**
   * §4.4 / Q13: the line under the input. An untouched name that slugifies to
   * nothing derives no path at all, so the author is told to type one instead
   * of being left with a bare `/play/`.
   */
  const slugProblem =
    slug.length > 0
      ? slugError(slug)
      : slugTouched
        ? '请填写访问路径'
        : '无法根据名称生成访问路径，请手动填写（仅限小写字母、数字与连字符）';

  const submit = (): void => {
    if (!puzzle) return;
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      toast.error('请填写游戏名称');
      return;
    }
    const trimmedSlug = slug.trim();
    if (trimmedSlug.length === 0) {
      toast.error('请填写访问路径');
      return;
    }
    const problem = slugError(trimmedSlug);
    if (problem) {
      toast.error(problem);
      return;
    }
    deploy.mutate(
      {
        // CONS-K16: the game belongs to the puzzle, not to the map version.
        puzzleId: puzzle.id,
        name: trimmed,
        slug: trimmedSlug,
        difficulty,
        // Only an explicit removal clears the stored cover (OPT-W03 §3).
        clearCover: coverRemoved && !cover,
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
            {puzzle
              ? `把谜题「${puzzle.name} v${puzzle.mapVersionNo}」部署为可玩的游戏。相同谜题只能部署一个游戏，再次部署将覆盖此前的游戏。`
              : '把谜题部署为可玩的游戏。'}
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
              placeholder="默认为谜题名称"
              onChange={(event) => setName(event.target.value)}
              disabled={deploy.isPending}
            />
          </div>

          {/* OPT-W04 §4.2: the access path is the game's public URL. */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="game-deploy-slug">
              访问路径
            </label>
            <div className="flex items-center gap-2">
              <Input
                id="game-deploy-slug"
                value={slug}
                maxLength={GAME_SLUG_MAX_LENGTH}
                placeholder="puzzle-my-map-medium"
                className={cn('font-mono text-xs', slugProblem ? 'border-destructive' : '')}
                onChange={(event) => {
                  setSlugTouched(true);
                  setSlug(normalizeSlugInput(event.target.value));
                }}
                disabled={deploy.isPending}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 shrink-0"
                title="按当前名称与难度重新生成"
                disabled={deploy.isPending}
                onClick={() => {
                  setSlug(buildDefaultSlug({ name, difficulty }));
                  setSlugTouched(true);
                }}
              >
                <RefreshCw className="mr-1 h-3.5 w-3.5" />
                重新生成
              </Button>
            </div>
            <p
              className={cn(
                'text-xs',
                slugProblem ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              {slugProblem ?? `/play/${slug}`}
            </p>
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
                ) : showStoredCover ? (
                  <img
                    src={storedCover}
                    alt="当前封面"
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
                  {cover
                    ? `已选择：${cover.name}`
                    : showStoredCover
                      ? '当前为该游戏已上传的封面。'
                      : ''}
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
                    {cover || showStoredCover ? '替换' : '上传'}
                  </Button>
                  {cover ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      disabled={deploy.isPending}
                      onClick={() => {
                        // Dropping a freshly picked file falls back to the
                        // stored cover; it only counts as "remove" afterwards.
                        setCover(null);
                      }}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      取消选择
                    </Button>
                  ) : showStoredCover ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      disabled={deploy.isPending}
                      onClick={() => setCoverRemoved(true)}
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
                if (file) setCoverRemoved(false);
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
