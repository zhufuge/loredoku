import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, ExternalLink, Package, Rocket, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  GAME_DIFFICULTY_COLORS,
  GAME_DIFFICULTY_LABELS,
  GAME_DIFFICULTY_TEXT_COLORS,
  type MapGameSummary,
  type PuzzleEntrySummary,
  type Theme,
  type ThemeDeploymentSummary,
} from '@loredoku/shared';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button, buttonVariants } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/layout/PageHeader';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
import { GameDeployDialog } from '@/components/game/GameDeployDialog';
import { ExportBundleDialog } from '@/components/theme/ExportBundleDialog';
import { useCancelGame, useGames } from '@/hooks/useGames';
import { usePuzzles } from '@/hooks/usePuzzles';
import { useRemoveDeployment, useThemeDeployments, useThemes } from '@/hooks/useThemes';
import { cn } from '@/lib/utils';
import { InlineLoading, LoredokuTick } from '@/components/common/LoredokuLoader';

/**
 * 部署模块（v0.7.1 §7.4）—— 一行 = 一条在线的游戏。
 *
 * v0.8.0 §16.4：**按主题分组**，不再是三段纵排。
 *
 * 加了合辑之后作者打开这一页问的是「玩家现在能看到什么」。三段纵排（合辑一段、
 * 单局一段）会把同一主题的合辑和它的 8 个单局劈到两大块里，而它们本来就是一件事
 * 的两层：合辑是这个主题的目录，单局是目录里那几关的另一条入口。
 *
 * ```
 * 红楼梦                                   8 关在线            [导出包]
 *   合辑「红楼梦」  /play/theme/hlm  8 关   [打开] [取消上线]
 *     撕扇 v3 · 因麒麟…                          ← 单局行，缩进、40px
 * 默认主题                                 4 关在线            [导出包]
 * ```
 *
 * 组头必须有，哪怕这个主题没有合辑 —— 「导出包」是**主题级**动作，挂在这一行上，
 * 没有组头它就无处安放。
 *
 * v0.8.0 §19：**认不出主题的部署不展示**。以前会给它们一个「未归入主题」的组，
 * 但这页是工作空间的视角（§18），不属于任何工作空间的行没有可回答的问题。
 * 工作空间里也只列**当前主题**的分组，别的主题不混进来。
 *
 * 取消部署是**假删**（`deleted_at`）：玩家的 `/play/{slug}` 立刻打不开，但同一个
 * 访问路径可以再用。取消**合辑**下线不一样：它只删目录，那几关的单局仍然在线。
 */
export function DeploymentsPage(): JSX.Element {
  /**
   * v0.8.0 §18：部署页也在一个工作空间里 —— 只列**这个主题**的在线内容。
   * 没有上下文时（老地址 / 单独渲染）退回「全部主题分组」，行为与上一版一致。
   */
  const workspace = useWorkspace();
  const gamesQuery = useGames();
  const themesQuery = useThemes();
  const deploymentsQuery = useThemeDeployments();
  const cancelMutation = useCancelGame();
  const removeDeployment = useRemoveDeployment();
  const [cancelTarget, setCancelTarget] = useState<MapGameSummary | null>(null);
  const [cancelCollection, setCancelCollection] = useState<ThemeDeploymentSummary | null>(null);
  const [exportTheme, setExportTheme] = useState<Theme | null>(null);
  /** 刚复制成功的那一行的 key（slug / 合辑 slug）—— 让勾号只出现在被点的那一行。 */
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [deployOpen, setDeployOpen] = useState(false);

  /**
   * 部署弹窗要的版本列表。只取已发布的版本行（`kind: 'version'`）——草稿行
   * 部署不了，列出来只会让人点了才发现。100 条足够覆盖任何真实工坊。
   *
   * §19：在工作空间里**只列这个主题的版本**。否则下拉里会混进别的主题的关，
   * 部署完它落回自己那个主题 —— 作者在红楼梦里点了一个默认主题的谜题，
   * 结果新游戏不出现在当前这一屏，看起来像「部署失败了」。
   */
  const versionsQuery = usePuzzles({
    kind: 'version',
    pageSize: 100,
    sort: 'updatedAt',
    order: 'desc',
    ...(workspace ? { themeCode: workspace.themeCode } : {}),
  });

  useEffect(() => {
    document.title = workspace ? `${workspace.theme.name} · 部署 · 格物` : '部署 · 格物';
  }, [workspace?.theme.name]);

  useEffect(() => {
    if (copiedKey === null) return;
    const timer = setTimeout(() => setCopiedKey(null), 1500);
    return () => clearTimeout(timer);
  }, [copiedKey]);

  const games = useMemo(() => gamesQuery.data ?? [], [gamesQuery.data]);
  const versions = versionsQuery.data?.list ?? null;
  const themes = useMemo(() => themesQuery.data ?? [], [themesQuery.data]);
  const deployments = useMemo(() => deploymentsQuery.data ?? [], [deploymentsQuery.data]);

  interface Group {
    key: string;
    theme: Theme;
    games: MapGameSummary[];
    collections: ThemeDeploymentSummary[];
  }

  const groups = useMemo<Group[]>(() => {
    const scoped = workspace
      ? themes.filter((theme) => theme.code === workspace.themeCode)
      : themes;
    // §19：分组按**编码**，因为游戏与合辑交上来的就是编码 —— 不再有 id↔code 的对照表。
    const byCode = new Map<string, Group>();
    for (const theme of scoped) {
      byCode.set(theme.code, { key: `theme-${theme.code}`, theme, games: [], collections: [] });
    }

    /**
     * 认不出主题的行**直接不进来**：这一页只回答「某个工作空间里有什么在线内容」，
     * 不属于任何工作空间的部署没有可回答的问题 —— 列成一个「未归入主题」的组，
     * 等于把数据库里的一处悬浮状态搬上屏幕，作者既看不懂也处理不了。
     *
     * 实际会掉进这里的只有两种：主题被删掉之后留下的行，以及工作空间之外别的主题
     * （`scoped` 只有一个主题时）。两种都不该出现在这一屏。
     */
    for (const game of games) byCode.get(game.themeCode)?.games.push(game);
    for (const deployment of deployments) {
      byCode.get(deployment.themeCode)?.collections.push(deployment);
    }

    // 空主题不占版面：这一页回答的是「玩家能看到什么」，没有在线内容的主题没什么可说。
    return scoped
      .map((theme) => byCode.get(theme.code)!)
      .filter((group) => group.games.length > 0 || group.collections.length > 0);
  }, [themes, games, deployments, workspace]);

  /** 页头那个数字要和屏幕上的行对得上 —— 藏起来的不算「在线」。 */
  const onlineCount = useMemo(
    () => groups.reduce((total, group) => total + group.games.length, 0),
    [groups],
  );

  /**
   * 某个版本已经部署过 → 用那条部署回填（同一个版本再部署就是覆盖它）。
   * 传函数而不是预先算一张表：列表和版本列表各自刷新时，弹窗永远读到最新的那份。
   */
  const existingGameFor = (entry: PuzzleEntrySummary): MapGameSummary | null =>
    games.find((game) => game.puzzleId === entry.id) ?? null;

  const copyPath = (path: string, key: string): void => {
    const absolute = `${window.location.origin}${path}`;
    void (async () => {
      try {
        await navigator.clipboard.writeText(absolute);
        setCopiedKey(key);
        toast.success('访问路径已复制');
      } catch {
        toast.error('复制失败，请手动选中');
      }
    })();
  };

  function renderCollectionRow(deployment: ThemeDeploymentSummary): JSX.Element {
    const playable = deployment.entries.filter((entry) => entry.game !== null).length;
    const path = `/play/theme/${deployment.slug}`;
    return (
      <div
        key={`collection-${deployment.id}`}
        className="flex items-center gap-4 border-b px-4 py-2.5"
      >
        <span className="w-48 shrink-0 truncate font-medium" title={deployment.name}>
          合辑「{deployment.name}」
        </span>
        <button
          type="button"
          onClick={() => copyPath(path, `collection-${deployment.slug}`)}
          title="复制完整访问路径"
          className="min-w-0 flex-1 truncate text-left font-mono text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          {path}
        </button>
        <span className="w-16 shrink-0 tabular-nums text-sm text-muted-foreground">
          {playable} 关
        </span>
        <div className="flex w-40 shrink-0 items-center justify-end gap-1">
          <a
            href={path}
            target="_blank"
            rel="noreferrer"
            title="在新标签页打开合辑"
            className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}
          >
            <ExternalLink className="h-4 w-4" />
          </a>
          <IconButton
            variant="ghost"
            icon={
              copiedKey === `collection-${deployment.slug}` ? (
                <Check className="h-4 w-4 text-success" />
              ) : (
                <Copy className="h-4 w-4" />
              )
            }
            label="复制合辑路径"
            onClick={() => copyPath(path, `collection-${deployment.slug}`)}
          />
          <IconButton
            variant="ghost"
            icon={<Trash2 className="h-4 w-4" />}
            label="取消合辑上线"
            className="text-destructive hover:text-destructive"
            onClick={() => setCancelCollection(deployment)}
          />
        </div>
      </div>
    );
  }

  /**
   * 单局行：**40px、缩进 24px**（§16.4 的「它是细节，不是同级内容」）。
   * 时间列被撤掉了 —— 40px 里塞七列读不出东西，而「什么时候上线的」在谜题版本
   * 详情里更准（游戏行的时间是部署时间，不是发布时间）。
   */
  function renderGameRow(game: MapGameSummary): JSX.Element {
    const initial = game.name.trim().charAt(0) || '游';
    const path = `/play/${game.slug}`;
    return (
      <div
        key={`game-${game.id}`}
        className="flex h-10 items-center gap-3 border-b py-1 pl-10 pr-4 last:border-b-0"
      >
        <span className="h-6 w-10 shrink-0 overflow-hidden rounded border bg-muted/40">
          {game.coverUrl ? (
            <img
              src={game.coverUrl}
              alt={game.name}
              draggable={false}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center bg-secondary/40 text-2xs font-semibold text-muted-foreground/60">
              {initial}
            </span>
          )}
        </span>

        <div className="w-48 shrink-0 truncate">
          <span className="font-medium">{game.name}</span>
          <span className="ml-1 text-2xs text-muted-foreground">
            来源：{game.puzzleName} v{game.puzzleVersionNo}
          </span>
        </div>

        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-2xs font-medium"
          style={{
            backgroundColor: GAME_DIFFICULTY_COLORS[game.difficulty],
            color: GAME_DIFFICULTY_TEXT_COLORS[game.difficulty],
          }}
        >
          {GAME_DIFFICULTY_LABELS[game.difficulty]}
        </span>

        <span className="w-14 shrink-0 tabular-nums text-xs text-muted-foreground">
          {game.gridSize} × {game.gridSize}
        </span>

        <button
          type="button"
          onClick={() => copyPath(path, game.slug)}
          title="复制完整访问路径"
          className="min-w-0 flex-1 truncate text-left font-mono text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          {path}
        </button>

        <div className="flex w-40 shrink-0 items-center justify-end gap-1">
          {/*
           * 用 <a target="_blank"> 而不是 navigate：游戏是给玩家看的独立页面，
           * 作者往往要一边对照工坊一边试玩，抢掉当前页签会丢掉列表的滚动位置。
           */}
          <a
            href={path}
            target="_blank"
            rel="noreferrer"
            title="在新标签页打开游戏"
            className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}
          >
            <ExternalLink className="h-4 w-4" />
          </a>
          <IconButton
            variant="ghost"
            icon={
              copiedKey === game.slug ? (
                <Check className="h-4 w-4 text-success" />
              ) : (
                <Copy className="h-4 w-4" />
              )
            }
            label="复制访问路径"
            onClick={() => copyPath(path, game.slug)}
          />
          <IconButton
            variant="ghost"
            icon={<Trash2 className="h-4 w-4" />}
            label="取消部署"
            className="text-destructive hover:text-destructive"
            onClick={() => setCancelTarget(game)}
          />
        </div>
      </div>
    );
  }

  function renderBody(): JSX.Element {
    if (gamesQuery.isLoading || themesQuery.isLoading) {
      return (
        <div className="space-y-2">
          {/* v0.7.9：骨架高 64（= 行高），原来是 80 —— 加载完成后整页会往上跳 16px。 */}
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      );
    }

    if (gamesQuery.isError) {
      return (
        <Card className="flex flex-col items-center gap-3 p-12 text-center">
          {/* v0.7.9：与其余四页统一 —— 给出真正的原因，而不是只有「加载失败」。 */}
          <p className="text-sm text-muted-foreground">
            {gamesQuery.error instanceof Error ? gamesQuery.error.message : '部署列表加载失败'}
          </p>
          <Button variant="outline" onClick={() => void gamesQuery.refetch()}>
            重试
          </Button>
        </Card>
      );
    }

    if (groups.length === 0) {
      return (
        // v0.7.8 §5：工坊五个列表页的空状态统一为「一句说明 + 一个主按钮」。
        // v0.7.11：按钮就是「部署」—— 空状态下一步要做的事，不再让人先去别处。
        <Card className="flex flex-col items-center gap-3 p-12 text-center">
          <p className="text-sm text-muted-foreground">还没有部署任何游戏</p>
          <Button onClick={() => setDeployOpen(true)}>
            <Rocket className="mr-1 h-3.5 w-3.5" />
            部署
          </Button>
        </Card>
      );
    }

    return (
      <div className="space-y-4">
        {groups.map((group) => {
          // 已经进了合辑的单局不再重复列一遍：组内的合辑行已经把它们算进去了。
          const inCollections = new Set(
            group.collections.flatMap((deployment) =>
              deployment.entries.map((entry) => entry.puzzleId),
            ),
          );
          const singles = group.games.filter((game) => !inCollections.has(game.puzzleId));
          return (
            <Card key={group.key} className="overflow-hidden">
              <div className="flex h-10 items-center gap-3 border-b px-4">
                <span className="min-w-0 flex-1 truncate text-2xs font-medium uppercase tracking-wider text-muted-foreground">
                  {group.theme.name}
                </span>
                <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">
                  {group.games.length} 关在线
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0 px-2 text-xs"
                  onClick={() => setExportTheme(group.theme)}
                >
                  <Package className="mr-1 h-3.5 w-3.5" />
                  导出包
                </Button>
              </div>
              {group.collections.map(renderCollectionRow)}
              {singles.map(renderGameRow)}
            </Card>
          );
        })}
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <PageHeader
        title="部署"
        description={
          gamesQuery.isLoading ? (
            <InlineLoading caption="正在加载部署…" />
          ) : (
            `共 ${onlineCount} 个游戏在线。`
          )
        }
        actions={
          <Button onClick={() => setDeployOpen(true)}>
            <Rocket className="mr-1 h-3.5 w-3.5" />
            部署
          </Button>
        }
      />

      {renderBody()}

      {/* v0.7.11：部署弹窗挂在这一页 —— 版本选择、回填与路径覆盖都在里面。 */}
      <GameDeployDialog
        puzzle={null}
        versions={versions}
        resolveExistingGame={existingGameFor}
        open={deployOpen}
        onOpenChange={setDeployOpen}
      />

      {/* v0.8.0 §16.10：导出先给清单，再给文件。 */}
      <ExportBundleDialog
        theme={exportTheme}
        games={
          exportTheme === null ? [] : games.filter((game) => game.themeCode === exportTheme.code)
        }
        onOpenChange={(open) => {
          if (!open) setExportTheme(null);
        }}
      />

      <AlertDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => {
          if (!open && !cancelMutation.isPending) setCancelTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>取消部署「{cancelTarget?.name}」？</AlertDialogTitle>
            <AlertDialogDescription>
              玩家通过 /play/{cancelTarget?.slug} 将立即无法访问；可以再用同一个访问路径重新部署。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelMutation.isPending}>取消</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={cancelMutation.isPending}
              onClick={() => {
                if (!cancelTarget) return;
                cancelMutation.mutate(cancelTarget.id, {
                  onSuccess: () => setCancelTarget(null),
                });
              }}
            >
              {cancelMutation.isPending ? (
                <>
                  <LoredokuTick className="mr-1" />
                  处理中…
                </>
              ) : (
                '取消部署'
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={cancelCollection !== null}
        onOpenChange={(open) => {
          if (!open && !removeDeployment.isPending) setCancelCollection(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>取消合辑「{cancelCollection?.name}」上线？</AlertDialogTitle>
            <AlertDialogDescription>
              合辑只是一份目录：取消之后 /play/theme/{cancelCollection?.slug} 打不开，
              但那几关的单局仍然在线，玩家还能单独进入。要真正下线一关，请取消它的部署。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeDeployment.isPending}>取消</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={removeDeployment.isPending}
              onClick={() => {
                if (!cancelCollection) return;
                removeDeployment.mutate(cancelCollection.id, {
                  onSuccess: () => setCancelCollection(null),
                });
              }}
            >
              {removeDeployment.isPending ? (
                <>
                  <LoredokuTick className="mr-1" />
                  处理中…
                </>
              ) : (
                '取消上线'
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
