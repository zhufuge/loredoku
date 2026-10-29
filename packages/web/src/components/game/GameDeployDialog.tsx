import { useEffect, useMemo, useRef, useState } from 'react';
import { ImagePlus, RefreshCw, Rocket, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import {
  GAME_DIFFICULTY_COLORS,
  GAME_DIFFICULTY_DEFAULT,
  GAME_DIFFICULTY_LABELS,
  GAME_DIFFICULTY_LEVELS,
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
import type {
  GameDifficulty,
  GameSlugConflict,
  MapGameSummary,
  PuzzleEntrySummary,
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
import { Select } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useDeployGame } from '@/hooks/useGames';
import { cn } from '@/lib/utils';
import { LoredokuTick } from '@/components/common/LoredokuLoader';

const COVER_ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml';

/**
 * 部署弹窗（v0.4.0 FEAT-G02 起，v0.7.1 §7.6 / §7.6.1 定稿）。封面在这里暂存，
 * 行建好之后才上传 —— 上传端点认的是新游戏的 id。
 *
 * - OPT-W03：重新部署时回填难度并展示现有封面，三态（保留 / 替换 / 移除）；
 * - **部署单元是一个谜题版本行**（§7.1 第 2 层拦截）：草稿行进不来，因为
 *   `puzzle` prop 的形状就是版本条目；
 * - 访问路径拆成「只读前缀 `puzzle-` + 可编辑中段」（v0.8.1 起难度不进路径）：
 *   已部署过的路径被改掉时明写「原访问路径将失效」。
 */
export function GameDeployDialog({
  puzzle,
  versions = null,
  resolveExistingGame,
  existingGame,
  open,
  onOpenChange,
}: {
  /**
   * 第 2 层拦截（v0.7.1 §7.1）：只有**版本条目**能进来 —— 草稿行不满足「已发布」，
   * 部署单元就是一个谜题版本行。
   *
   * v0.7.11：部署页从「自己挑一个版本」出发，所以这里允许传 `null`，由
   * `versions` 在弹窗里选（见下）。
   */
  puzzle: PuzzleEntrySummary | null;
  /**
   * v0.7.11：可选版本列表 —— 只有部署页会传。
   *
   * 它一在场，弹窗顶部就多一个「谜题版本」下拉；选中之后名称 / 路径 / 封面 /
   * 难度全部按那个版本回填（作者在部署页并不先选谜题，是先按「部署」）。
   */
  versions?: PuzzleEntrySummary[] | null;
  /** 某个版本已经部署过时，用那条部署回填（同一个版本再部署 = 覆盖它）。 */
  resolveExistingGame?: (puzzle: PuzzleEntrySummary) => MapGameSummary | null;
  /** OPT-W03: the puzzle's current game, used to prefill the re-deploy. */
  existingGame?: MapGameSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): JSX.Element {
  const chooseable = versions !== null && versions.length > 0;
  const [choiceId, setChoiceId] = useState<number | null>(null);

  /** 实际要部署的那个版本：外部指定优先，其次弹窗里选的。 */
  const activePuzzle = useMemo<PuzzleEntrySummary | null>(() => {
    if (puzzle) return puzzle;
    if (!chooseable) return null;
    return versions.find((entry) => entry.id === choiceId) ?? null;
  }, [puzzle, chooseable, versions, choiceId]);

  /**
   * 已经部署过的那个版本 → 用它回填。
   *
   * 解析函数放进 ref：调用方多半写成内联箭头，把它塞进 `useMemo` 的依赖会让
   * 回填 effect 每次渲染都重跑，作者刚打的字瞬间被冲掉。
   */
  const resolverRef = useRef(resolveExistingGame);
  resolverRef.current = resolveExistingGame;
  const activeExisting = useMemo<MapGameSummary | null>(() => {
    if (existingGame !== undefined && existingGame !== null) return existingGame;
    if (!puzzle && activePuzzle) return resolverRef.current?.(activePuzzle) ?? null;
    return existingGame ?? null;
  }, [existingGame, puzzle, activePuzzle]);

  const [name, setName] = useState('');
  /**
   * v0.7.1 §7.6.1：访问路径拆成「前缀 + 可编辑中段」。前缀（`puzzle-`）是只读
   * 文本，唯一可编辑的是中段。v0.8.1：**难度不再是后缀** —— 改难度不该把
   * 对外的地址改掉，路径只表达「这是哪一关」。
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
  /**
   * v0.7.11：路径撞车时不再是「一句 toast 报错」，而是问一次要不要**覆盖**。
   * 存的是服务端给的冲突说明（被占的路径 + 占位的那条部署），`null` = 没冲突。
   */
  const [conflict, setConflict] = useState<GameSlugConflict | null>(null);
  /** 冲突那一刻的提交内容 —— 确认覆盖时原样重发，只多一个 `overwriteSlug`。 */
  const pendingDeployRef = useRef<DeployRequest | null>(null);

  const deploy = useDeployGame({ onSlugConflict: (info) => setConflict(info) });

  // Every open starts from the puzzle's own defaults, or from the game's stored
  // values when this version row was deployed before (OPT-W03).
  useEffect(() => {
    if (!open || !activePuzzle) return;
    const startName = activePuzzle.name;
    const startDifficulty = activeExisting?.difficulty ?? GAME_DIFFICULTY_DEFAULT;
    setName(startName);
    setDifficulty(startDifficulty);
    setCover(null);
    setCoverRemoved(false);
    if (activeExisting) {
      // 已发布的路径是给持链接的人的承诺：回填并当作「已经改过」，改名字或难度
      // 都不会悄悄重写它，只会在下面显式提示「原路径将失效」。
      // v0.8.1：存量路径可能带着难度后缀，反解时剥掉（splitSlug）。
      setMiddle(splitSlug(activeExisting.slug));
      setMiddleTouched(true);
    } else {
      setMiddle(slugify(startName));
      setMiddleTouched(false);
    }
  }, [open, activePuzzle, activeExisting]);

  /** 关掉弹窗时把冲突与已选版本都收掉 —— 下次打开不该还停在「要覆盖吗」。 */
  useEffect(() => {
    if (open) return;
    setConflict(null);
    pendingDeployRef.current = null;
    setChoiceId(null);
  }, [open]);

  /**
   * 作者没手动改过中段时，它跟着名称走 —— 直接写在名称输入的 onChange 里，而不是
   * 用一个「同步」effect：两个 effect 抢着写同一个 state 时，初始化的那次回填会
   * 被随后的一次覆盖（已部署游戏的中段被清成默认值）。
   */
  const changeName = (next: string): void => {
    setName(next);
    if (!middleTouched) setMiddle(slugify(next));
  };

  // v0.8.1：难度不参与拼接 —— 路径只由中段决定。
  const slug = middle.trim().length > 0 ? composeSlug(middle) : '';

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
  const puzzleCoverUrl = activePuzzle?.coverUrl ?? null;
  const coverSource: 'picked' | 'game' | 'puzzle' | 'none' = cover
    ? 'picked'
    : coverRemoved
      ? 'none'
      : activeExisting?.coverUrl
        ? 'game'
        : puzzleCoverUrl
          ? 'puzzle'
          : 'none';
  /** 此刻封面框里画的那张图（选了新文件时由 `coverPreview` 顶替）。 */
  const inheritedCover =
    coverSource === 'game'
      ? activeExisting?.coverUrl ?? null
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
  const slugReplaced =
    activeExisting != null && slug.length > 0 && slug !== activeExisting.slug;

  /**
   * v0.7.11：一次部署请求的完整形状。抽成类型是因为冲突时要用**同一份**内容
   * 重发一遍（只多一个 `overwriteSlug`）—— 让作者只回答「覆盖吗」，而不是
   * 重新填一遍表单。
   */
  interface DeployRequest {
    puzzleId: number;
    name: string;
    slug: string;
    difficulty: GameDifficulty;
    clearCover: boolean;
    cover: File | null;
    coverFromPuzzleUrl: string | null;
    overwriteSlug?: boolean;
  }

  const submit = (): void => {
    if (!activePuzzle) {
      toast.error('请选择要部署的谜题版本');
      return;
    }
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      toast.error('请填写游戏名称');
      return;
    }
    // 中段为空时不要拼 —— 空中段拼出来是光杆 `puzzle`，看着合法其实丢了名称。
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
    const request: DeployRequest = {
      // CONS-K16: the game belongs to the puzzle, not to the map version.
      puzzleId: activePuzzle.id,
      name: trimmed,
      slug: trimmedSlug,
      difficulty,
      // Only an explicit removal clears the stored cover (OPT-W03 §3).
      clearCover: coverRemoved && !cover,
      cover,
      // v0.7.2 §4：没有自己的封面时，把谜题封面复制一份过来。
      coverFromPuzzleUrl: coverSource === 'puzzle' ? puzzleCoverUrl : null,
    };
    pendingDeployRef.current = request;
    deploy.mutate(request, { onSuccess: () => onOpenChange(false) });
  };

  /** 「覆盖」= 原样重发 + `overwriteSlug`，服务端把占位那条部署假删。 */
  const overwrite = (): void => {
    const request = pendingDeployRef.current;
    if (!request) return;
    setConflict(null);
    deploy.mutate(
      { ...request, overwriteSlug: true },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  /**
   * 还没选版本时，整张表单都是「还没轮到它」—— 禁用而不是只让提交失败，
   * 免得作者填完名称才发现上面那格是空的。
   */
  const busy = deploy.isPending || activePuzzle === null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>部署为游戏</DialogTitle>
          <DialogDescription>
            {activePuzzle
              ? `把谜题「${activePuzzle.name} v${activePuzzle.versionNo ?? ''}」部署为可玩的游戏。每个谜题版本可以部署一个游戏；再次部署同一版本将覆盖此前的游戏。`
              : '选择要部署的谜题版本，再确认名称、访问路径、封面与难度。'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/*
            v0.7.11：部署页不先挑谜题，而是先按「部署」—— 版本选择因此搬进
            弹窗第一位。选中之后下面四项（名称 / 路径 / 封面 / 难度）全部按那个
            版本回填：作者改的永远是「这一次部署」，不是重新描述一遍谜题。
          */}
          {chooseable ? (
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="game-deploy-version">
                谜题版本
              </label>
              <Select
                id="game-deploy-version"
                value={choiceId === null ? '' : String(choiceId)}
                // 选择器自己永远可用（除非在提交中），否则一进来就被自己锁住了。
                disabled={deploy.isPending}
                onChange={(event) => {
                  const next = event.target.value;
                  setChoiceId(next === '' ? null : Number(next));
                }}
              >
                <option value="">选择要部署的谜题版本…</option>
                {versions?.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name} v{entry.versionNo ?? ''} · {entry.gridSize}×{entry.gridSize}
                    {entry.deployed ? '（已部署，将覆盖）' : ''}
                  </option>
                ))}
              </Select>
              {activePuzzle ? null : (
                <p className="text-xs text-muted-foreground">
                  只有已发布的谜题版本可以部署。
                </p>
              )}
            </div>
          ) : null}

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
              disabled={busy}
            />
          </div>

          {/* OPT-W04 §4.2 + v0.7.1 §7.6.1: the access path is the game's public
              URL — the author edits only its middle segment. v0.8.1：没有难度后缀。 */}
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
                  disabled={busy}
                  className="min-w-0 flex-1 bg-transparent px-0.5 font-mono text-xs outline-none placeholder:text-muted-foreground/60 disabled:cursor-not-allowed"
                  onChange={(event) => {
                    setMiddleTouched(true);
                    setMiddle(normalizeSlugInput(event.target.value));
                  }}
                />
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-10 shrink-0"
                title="按当前名称重新生成中段"
                disabled={busy}
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
                原访问路径 /play/{activeExisting?.slug} 将失效。
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
                    disabled={busy}
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
                      disabled={busy}
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
                      disabled={busy}
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
            // 取消永远可点（只在提交中禁用）—— 没选版本时它是最该按的那一个。
            disabled={deploy.isPending}
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button disabled={busy} onClick={submit}>
            <Rocket className="mr-1 h-3.5 w-3.5" />
            {deploy.isPending ? '部署中…' : '部署'}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/*
        v0.7.11：路径撞车的第二个问题 —— 「覆盖」。
        以前这里只有一句 toast「访问路径已被占用，请更换」，作者得先去部署页把
        对方撤掉再回来重填一遍。现在冲突是一个**选择**：说清是谁占着，给出
        「覆盖」；确认后原样重发（只多 `overwriteSlug`），占位那条被假删。
        用 AlertDialog 而不是又把主弹窗换一套表单：这不是编辑，是一次确认。
      */}
      <AlertDialog
        open={conflict !== null}
        onOpenChange={(next) => {
          if (!next) setConflict(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>访问路径已被占用</AlertDialogTitle>
            <AlertDialogDescription>
              /play/{conflict?.slug} 现在是「{conflict?.name}」
              {conflict?.puzzleName ? `（来自谜题「${conflict.puzzleName}」）` : ''}
              的访问路径。覆盖后那条部署会立即下线，这条链接转给当前谜题版本。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deploy.isPending}>取消</AlertDialogCancel>
            <Button variant="destructive" disabled={deploy.isPending} onClick={overwrite}>
              {deploy.isPending ? (
                <>
                  <LoredokuTick className="mr-1" />
                  处理中…
                </>
              ) : (
                '覆盖'
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
