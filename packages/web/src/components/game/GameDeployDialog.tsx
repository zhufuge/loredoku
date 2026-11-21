import { useEffect, useMemo, useRef, useState } from 'react';
import { ImagePlus, RefreshCw, Rocket, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import {
  GAME_NAME_MAX_LENGTH,
  GAME_SLUG_MAX_LENGTH,
  GAME_SLUG_PREFIX,
  GAME_SORT_WEIGHT_DEFAULT,
  GAME_SORT_WEIGHT_MAX,
  GAME_SORT_WEIGHT_MIN,
  composeSlug,
  defaultDifficultyLevel,
  difficultyBadge,
  normalizeSlugInput,
  resolveDifficultyTiers,
  slugError,
  slugify,
  splitSlug,
} from '@loredoku/shared';
import type {
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
import { useWorkspace } from '@/components/layout/WorkspaceContext';
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

/** 部署弹窗（v0.7.1 §7.6）：封面暂存到行建好后才上传；部署单元是版本行，草稿行进不来；路径 = 只读 `puzzle-` 前缀 + 中段（难度不进路径，改时须提示原路径失效），中段默认取谜题编码。 */
export function GameDeployDialog({
  puzzle,
  versions = null,
  resolveExistingGame,
  existingGame,
  siblingGame = null,
  open,
  onOpenChange,
}: {
  /** 第 2 层拦截（v0.7.1 §7.1）：只收版本条目，草稿行进不来；部署页从「自己挑版本」出发，允许 `null` 由 `versions` 选。 */
  puzzle: PuzzleEntrySummary | null;
  /** 可选版本列表，只有部署页传；一在场弹窗顶部就多一个版本下拉，选中后四项按它回填。 */
  versions?: PuzzleEntrySummary[] | null;
  /** 某个版本已经部署过时，用那条部署回填（同一个版本再部署 = 覆盖它）。 */
  resolveExistingGame?: (puzzle: PuzzleEntrySummary) => MapGameSummary | null;
  /** OPT-W03: the puzzle's current game, used to prefill the re-deploy. */
  existingGame?: MapGameSummary | null;
  /** 同一谜题别的版本已部署过时的那条 —— 只借难度与顺序，封面 / 路径属这一版自己。 */
  siblingGame?: MapGameSummary | null;
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

  /** 已部署版本 → 用它回填。解析函数放 ref：内联箭头进 `useMemo` 依赖会让回填 effect 每次渲染重跑、冲掉作者刚打的字。 */
  const resolverRef = useRef(resolveExistingGame);
  resolverRef.current = resolveExistingGame;
  const activeExisting = useMemo<MapGameSummary | null>(() => {
    if (existingGame !== undefined && existingGame !== null) return existingGame;
    if (!puzzle && activePuzzle) return resolverRef.current?.(activePuzzle) ?? null;
    return existingGame ?? null;
  }, [existingGame, puzzle, activePuzzle]);

  const [name, setName] = useState('');
  /* v0.7.1 §7.6.1：路径 = 只读前缀 + 可编辑中段；难度不是后缀，改难度不得改对外地址。 */
  const [middle, setMiddle] = useState('');
  /* 难度选项来自当前主题的分级（概览页可改）；没配过则用内置五档。 */
  const workspace = useWorkspace();
  const tiers = useMemo(
    () => resolveDifficultyTiers(workspace?.theme.data.difficultyLevels),
    [workspace?.theme.data.difficultyLevels],
  );
  const [difficulty, setDifficulty] = useState<number>(() => defaultDifficultyLevel(tiers));
  /* 存成字符串：空串是合法中间态，用数字会把「清空」读成 0 并提前定序。 */
  const [sortWeight, setSortWeight] = useState(String(GAME_SORT_WEIGHT_DEFAULT));
  const [cover, setCover] = useState<File | null>(null);
  /* OPT-W03 §3: 封面三态 —— 保留已有 / `cover` 替换 / `coverRemoved` 移除。 */
  const [coverRemoved, setCoverRemoved] = useState(false);
  const [middleTouched, setMiddleTouched] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  /* 路径撞车时问一次是否覆盖；存服务端的冲突说明，`null` = 没冲突。 */
  const [conflict, setConflict] = useState<GameSlugConflict | null>(null);
  /** 冲突那一刻的提交内容 —— 确认覆盖时原样重发，只多一个 `overwriteSlug`。 */
  const pendingDeployRef = useRef<DeployRequest | null>(null);

  const deploy = useDeployGame({ onSlugConflict: (info) => setConflict(info) });

  /* 当前难度若已不在分级里（作者删了那一档），补在最后，否则打开时没有任何按钮选中。 */
  const difficultyOptions = useMemo(() => {
    const list = tiers.map((tier) => ({ level: tier.level, label: tier.label }));
    if (!list.some((tier) => tier.level === difficulty)) {
      list.push({ level: difficulty, label: `第 ${difficulty} 档` });
    }
    return list;
  }, [tiers, difficulty]);

  /* 作者还没动过难度 / 顺序：血统清单异步晚到时只补这两项，不覆盖已改的值。 */
  const difficultyTouchedRef = useRef(false);
  const weightTouchedRef = useRef(false);

  // Every open starts from the puzzle's own defaults, or from the game's stored
  // values when this version row was deployed before (OPT-W03).
  useEffect(() => {
    if (!open || !activePuzzle) return;
    const startName = activePuzzle.name;
    const startDifficulty = activeExisting?.difficulty ?? defaultDifficultyLevel(tiers);
    setName(startName);
    setDifficulty(startDifficulty);
    // 重新部署时回填那条部署自己的顺序 —— 否则每次再部署都会把它悄悄
    // 归 0，作者排好的先后在「改个封面」之后就散了。
    setSortWeight(String(activeExisting?.sortWeight ?? GAME_SORT_WEIGHT_DEFAULT));
    difficultyTouchedRef.current = false;
    weightTouchedRef.current = false;
    setCover(null);
    setCoverRemoved(false);
    if (activeExisting) {
      // 已发布的路径是给持链接的人的承诺：回填并当作「已经改过」，改名字或难度
      // 都不会悄悄重写它，只会在下面显式提示「原路径将失效」。
      // 存量路径可能带着难度后缀，反解时剥掉（splitSlug）。
      setMiddle(splitSlug(activeExisting.slug));
      setMiddleTouched(true);
    } else {
      /* v0.8.5 §7.4：先看编码 —— 有编码用它作路径中段，没有才退回按名称推导。 */
      setMiddle(activePuzzle.code ? slugify(activePuzzle.code) : slugify(startName));
      setMiddleTouched(false);
    }
  }, [open, activePuzzle, activeExisting, tiers]);

  /* 兄弟部署可能晚到：只补难度与顺序，不重跑整表回填（会冲掉刚打的名称 / 路径）；已改过的不覆盖。 */
  useEffect(() => {
    if (!open || !activePuzzle || activeExisting || !siblingGame) return;
    if (!difficultyTouchedRef.current) setDifficulty(siblingGame.difficulty);
    if (!weightTouchedRef.current) setSortWeight(String(siblingGame.sortWeight));
  }, [open, activePuzzle, activeExisting, siblingGame]);

  /** 关掉弹窗时把冲突与已选版本都收掉 —— 下次打开不该还停在「要覆盖吗」。 */
  useEffect(() => {
    if (open) return;
    setConflict(null);
    pendingDeployRef.current = null;
    setChoiceId(null);
  }, [open]);

  /* 中段没被手动改过就跟着名称走；写在 onChange 里而非同步 effect（两支 effect 抢写会冲掉回填）。有编码时不跟名称。 */
  const changeName = (next: string): void => {
    setName(next);
    if (middleTouched) return;
    setMiddle(activePuzzle?.code ? slugify(activePuzzle.code) : slugify(next));
  };

  // 难度不参与拼接 —— 路径只由中段决定。
  const slug = middle.trim().length > 0 ? composeSlug(middle) : '';

  const coverPreview = useMemo(
    () => (cover ? URL.createObjectURL(cover) : null),
    [cover],
  );
  useEffect(() => {
    if (!coverPreview) return;
    return () => URL.revokeObjectURL(coverPreview);
  }, [coverPreview]);

  /* v0.7.2 §4：封面四档 —— 新选文件 / 游戏已有 / 谜题自带 / 无；谜题封面是默认值。 */
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

  /* 没名称也推不出路径时提示手填，而不是留下光杆 `/play/`。 */
  const slugProblem =
    slug.length > 0
      ? slugError(slug)
      : middleTouched
        ? '请填写访问路径'
        : '无法根据名称生成访问路径，请手动填写（仅限小写字母、数字与连字符）';

  /** 已部署过的路径被改掉了 —— 明写出来，别让作者以为旧链接还有效。 */
  const slugReplaced =
    activeExisting != null && slug.length > 0 && slug !== activeExisting.slug;

  /* 顺序三种语义：空串 → `undefined`（沿用原值）；合法整数 → 用之；其它 → 拦住并报区间。 */
  const weightText = sortWeight.trim();
  const weightValue = weightText === '' ? undefined : Number(weightText);
  const weightProblem =
    weightValue !== undefined &&
    (!Number.isInteger(weightValue) ||
      weightValue < GAME_SORT_WEIGHT_MIN ||
      weightValue > GAME_SORT_WEIGHT_MAX)
      ? `顺序需为 ${GAME_SORT_WEIGHT_MIN} 到 ${GAME_SORT_WEIGHT_MAX} 之间的整数`
      : null;

  /* 一次部署请求的完整形状；抽成类型是为了冲突时能用同一份内容重发（只多 `overwriteSlug`）。 */
  interface DeployRequest {
    puzzleId: number;
    name: string;
    slug: string;
    difficulty: number;
    sortWeight?: number;
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
    if (weightProblem) {
      toast.error(weightProblem);
      return;
    }
    const request: DeployRequest = {
      // CONS-K16: the game belongs to the puzzle, not to the map version.
      puzzleId: activePuzzle.id,
      name: trimmed,
      slug: trimmedSlug,
      difficulty,
      // 空着就不发这个键 —— 服务端会沿用上一次的值，而不是把它清成 0。
      ...(weightValue === undefined ? {} : { sortWeight: weightValue }),
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

  /* 没选版本时整张表单禁用，免得作者填完才发现上面那格是空的。 */
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
          {/* 部署页先按「部署」再挑谜题，版本选择因此在第一位；选中后下面四项全部按它回填。 */}
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
              {difficultyOptions.map((tier) => {
                const badge = difficultyBadge(tiers, tier.level);
                return (
                  <button
                    key={tier.level}
                    type="button"
                    aria-pressed={difficulty === tier.level}
                    onClick={() => {
                      difficultyTouchedRef.current = true;
                      setDifficulty(tier.level);
                    }}
                    className={cn(
                      // FEAT-O01: tint + dark label (was `text-white`).
                      'rounded-full px-3 py-1 text-xs font-medium transition-opacity',
                      difficulty === tier.level
                        ? 'ring-2 ring-offset-2 ring-offset-background'
                        : 'opacity-60 hover:opacity-90',
                    )}
                    style={{
                      backgroundColor: badge.backgroundColor,
                      color: badge.color,
                      ...(difficulty === tier.level
                        ? { boxShadow: `0 0 0 2px ${badge.backgroundColor}` }
                        : {}),
                    }}
                  >
                    {tier.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 顺序：小的在前，同权重按访问路径；放难度之后，是本次部署的第五项。 */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="game-deploy-sort">
              顺序
            </label>
            <div className="flex items-center gap-3">
              <Input
                id="game-deploy-sort"
                type="number"
                inputMode="numeric"
                step={1}
                min={GAME_SORT_WEIGHT_MIN}
                max={GAME_SORT_WEIGHT_MAX}
                value={sortWeight}
                placeholder={String(GAME_SORT_WEIGHT_DEFAULT)}
                disabled={busy}
                aria-describedby="game-deploy-sort-hint"
                aria-invalid={weightProblem !== null}
                className={cn('h-10 w-24 tabular-nums', weightProblem && 'border-destructive')}
                onChange={(event) => {
                  weightTouchedRef.current = true;
                  setSortWeight(event.target.value);
                }}
              />
              <p
                id="game-deploy-sort-hint"
                className={cn(
                  'text-xs',
                  weightProblem ? 'text-destructive' : 'text-muted-foreground',
                )}
              >
                {weightProblem ?? '数字小的排前面，相同则按访问路径'}
              </p>
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

      {/* 撞车时冲突是一个选择：说清谁占着，确认后原样重发（多 `overwriteSlug`），占位那条假删。 */}
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
