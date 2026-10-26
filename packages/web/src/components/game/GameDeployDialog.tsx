import { useEffect, useMemo, useRef, useState } from 'react';
import { ImagePlus, RefreshCw, Rocket, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import {
  GAME_DIFFICULTY_COLORS,
  GAME_DIFFICULTY_DEFAULT,
  GAME_DIFFICULTY_LABELS,
  GAME_DIFFICULTY_LEVELS,
  GAME_DIFFICULTY_SLUGS,
  GAME_DIFFICULTY_TEXT_COLORS,
  GAME_NAME_MAX_LENGTH,
  GAME_SLUG_MAX_LENGTH,
  GAME_SLUG_PREFIX,
  composeSlug,
  normalizeSlugInput,
  slugError,
  slugify,
  splitSlug,
} from '@loredoku/shared';
import type { GameDifficulty, MapGameSummary, PuzzleEntrySummary } from '@loredoku/shared';
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
 * 部署弹窗（v0.4.0 FEAT-G02 起，v0.7.1 §7.6 / §7.6.1 定稿）。封面在这里暂存，
 * 行建好之后才上传 —— 上传端点认的是新游戏的 id。
 *
 * - OPT-W03：重新部署时回填难度并展示现有封面，三态（保留 / 替换 / 移除）；
 * - **部署单元是一个谜题版本行**（§7.1 第 2 层拦截）：草稿行进不来，因为
 *   `puzzle` prop 的形状就是版本条目；
 * - 访问路径拆成「只读前缀 `puzzle-` + 可编辑中段 + 只读难度后缀」：难度永远
 *   实时参与拼接，已部署过的路径被改掉时明写「原访问路径将失效」。
 */
export function GameDeployDialog({
  puzzle,
  existingGame,
  open,
  onOpenChange,
}: {
  /**
   * 第 2 层拦截（v0.7.1 §7.1）：只有**版本条目**能进来 —— 草稿行不满足「已发布」，
   * 部署单元就是一个谜题版本行。
   */
  puzzle: PuzzleEntrySummary | null;
  /** OPT-W03: the puzzle's current game, used to prefill the re-deploy. */
  existingGame?: MapGameSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): JSX.Element {
  const deploy = useDeployGame();
  const [name, setName] = useState('');
  /**
   * v0.7.1 §7.6.1：访问路径拆成「前缀 + 可编辑中段 + 难度后缀」。前缀（`puzzle-`）
   * 与后缀（`-medium` 之类）是只读文本，唯一可编辑的是中段 —— 作者要对外公布
   * 的是整条路径，但只有中段需要他操心。
   */
  const [middle, setMiddle] = useState('');
  const [difficulty, setDifficulty] = useState<GameDifficulty>(GAME_DIFFICULTY_DEFAULT);
  const [cover, setCover] = useState<File | null>(null);
  /**
   * OPT-W03 §3: the cover has three states — keep the stored one (default),
   * replace it with `cover`, or drop it (`coverRemoved`).
   */
  const [coverRemoved, setCoverRemoved] = useState(false);
  const [middleTouched, setMiddleTouched] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Every open starts from the puzzle's own defaults, or from the game's stored
  // values when this version row was deployed before (OPT-W03).
  useEffect(() => {
    if (!open || !puzzle) return;
    const startName = puzzle.name;
    const startDifficulty = existingGame?.difficulty ?? GAME_DIFFICULTY_DEFAULT;
    setName(startName);
    setDifficulty(startDifficulty);
    setCover(null);
    setCoverRemoved(false);
    if (existingGame) {
      // 已发布的路径是给持链接的人的承诺：回填并当作「已经改过」，改名字或难度
      // 都不会悄悄重写它，只会在下面显式提示「原路径将失效」。
      setMiddle(splitSlug(existingGame.slug, existingGame.difficulty));
      setMiddleTouched(true);
    } else {
      setMiddle(slugify(startName));
      setMiddleTouched(false);
    }
  }, [open, puzzle, existingGame]);

  /**
   * 作者没手动改过中段时，它跟着名称走 —— 直接写在名称输入的 onChange 里，而不是
   * 用一个「同步」effect：两个 effect 抢着写同一个 state 时，初始化的那次回填会
   * 被随后的一次覆盖（已部署游戏的中段被清成默认值）。
   */
  const changeName = (next: string): void => {
    setName(next);
    if (!middleTouched) setMiddle(slugify(next));
  };

  /**
   * 难度**永远**实时参与拼接（v0.7.1 起不再冻结）—— 改难度就改后缀，
   * 路径跟着变，`existingGame` 在场时下面会提示原路径失效。
   */
  const slug = middle.trim().length > 0 ? composeSlug(middle, difficulty) : '';

  const coverPreview = useMemo(
    () => (cover ? URL.createObjectURL(cover) : null),
    [cover],
  );
  useEffect(() => {
    if (!coverPreview) return;
    return () => URL.revokeObjectURL(coverPreview);
  }, [coverPreview]);

  /**
   * v0.7.2 §4：封面来源分四档 —— 新选的文件 / 游戏已有的 / **谜题自己的** / 无。
   * 谜题封面是「默认值」：作者不选文件，就把谜题那张复制成游戏封面，省掉每次
   * 部署都重选一次图。
   */
  const puzzleCoverUrl = puzzle?.coverUrl ?? null;
  const coverSource: 'picked' | 'game' | 'puzzle' | 'none' = cover
    ? 'picked'
    : coverRemoved
      ? 'none'
      : existingGame?.coverUrl
        ? 'game'
        : puzzleCoverUrl
          ? 'puzzle'
          : 'none';
  /** 此刻封面框里画的那张图（选了新文件时由 `coverPreview` 顶替）。 */
  const inheritedCover =
    coverSource === 'game'
      ? existingGame?.coverUrl ?? null
      : coverSource === 'puzzle'
        ? puzzleCoverUrl
        : null;
  const showStoredCover = !cover && inheritedCover !== null;

  /**
   * §4.4 / Q13: the line under the input. An untouched name that slugifies to
   * nothing derives no path at all, so the author is told to type one instead
   * of being left with a bare `/play/`.
   */
  const slugProblem =
    slug.length > 0
      ? slugError(slug)
      : middleTouched
        ? '请填写访问路径'
        : '无法根据名称生成访问路径，请手动填写（仅限小写字母、数字与连字符）';

  /** 已部署过的路径被改掉了 —— 明写出来，别让作者以为旧链接还有效。 */
  const slugReplaced = existingGame != null && slug.length > 0 && slug !== existingGame.slug;

  const submit = (): void => {
    if (!puzzle) return;
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      toast.error('请填写游戏名称');
      return;
    }
    // 中段为空时不要拼 —— `composeSlug('')` 会退化成 `puzzle-medium`，
    // 看着合法其实丢了名称。
    if (middle.trim().length === 0) {
      toast.error(
        middleTouched
          ? '请填写访问路径'
          : '无法根据名称生成访问路径，请手动填写（仅限小写字母、数字与连字符）',
      );
      return;
    }
    const trimmedSlug = slug.trim();
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
        // v0.7.2 §4：没有自己的封面时，把谜题封面复制一份过来。
        coverFromPuzzleUrl: coverSource === 'puzzle' ? puzzleCoverUrl : null,
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
              ? `把谜题「${puzzle.name} v${puzzle.versionNo ?? ''}」部署为可玩的游戏。每个谜题版本可以部署一个游戏；再次部署同一版本将覆盖此前的游戏。`
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
              onChange={(event) => changeName(event.target.value)}
              disabled={deploy.isPending}
            />
          </div>

          {/* OPT-W04 §4.2 + v0.7.1 §7.6.1: the access path is the game's public
              URL — the author edits only its middle segment. */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="game-deploy-slug">
              访问路径
            </label>
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'flex h-10 min-w-0 flex-1 items-center rounded-md border border-input bg-background px-2 font-mono text-xs',
                  slugProblem ? 'border-destructive' : undefined,
                )}
              >
                {/* 前缀 / 后缀是只读文本：路径的「固定形状」由它俩表达。 */}
                <span className="shrink-0 select-none text-muted-foreground">
                  {GAME_SLUG_PREFIX}-
                </span>
                <input
                  id="game-deploy-slug"
                  value={middle}
                  maxLength={GAME_SLUG_MAX_LENGTH}
                  placeholder="my-map"
                  disabled={deploy.isPending}
                  className="min-w-0 flex-1 bg-transparent px-0.5 font-mono text-xs outline-none placeholder:text-muted-foreground/60 disabled:cursor-not-allowed"
                  onChange={(event) => {
                    setMiddleTouched(true);
                    setMiddle(normalizeSlugInput(event.target.value));
                  }}
                />
                <span className="shrink-0 select-none text-muted-foreground">
                  -{GAME_DIFFICULTY_SLUGS[difficulty]}
                </span>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-10 shrink-0"
                title="按当前名称重新生成中段"
                disabled={deploy.isPending}
                onClick={() => {
                  setMiddle(slugify(name));
                  setMiddleTouched(true);
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
            {slugReplaced && !slugProblem ? (
              <p className="text-xs text-warning">
                原访问路径 /play/{existingGame.slug} 将失效。
              </p>
            ) : null}
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
                    src={inheritedCover ?? undefined}
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
                  {coverSource === 'picked'
                    ? `已选择：${cover?.name ?? ''}`
                    : coverSource === 'game'
                      ? '当前为该游戏已上传的封面。'
                      : coverSource === 'puzzle'
                        ? '默认使用谜题封面，可替换。'
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
                    // FEAT-O01: tint + dark label (was `text-white`).
                    'rounded-full px-3 py-1 text-xs font-medium transition-opacity',
                    difficulty === level
                      ? 'ring-2 ring-offset-2 ring-offset-background'
                      : 'opacity-60 hover:opacity-90',
                  )}
                  style={{
                    backgroundColor: GAME_DIFFICULTY_COLORS[level],
                    color: GAME_DIFFICULTY_TEXT_COLORS[level],
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
