import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, ExternalLink, Package, Rocket, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  type MapGameSummary,
  type PuzzleEntrySummary,
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
import { DifficultyBadge } from '@/components/game/DifficultyBadge';
import { GameDeployDialog } from '@/components/game/GameDeployDialog';
import { ExportBundleDialog } from '@/components/theme/ExportBundleDialog';
import { useCancelGame, useGames } from '@/hooks/useGames';
import { usePuzzles } from '@/hooks/usePuzzles';
import { useRemoveDeployment, useThemeDeployments } from '@/hooks/useThemes';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { InlineLoading, LoredokuTick } from '@/components/common/LoredokuLoader';

/**
 * 部署模块（v0.7.1 §7.4）—— **一行 = 一条在线的东西**，v0.8.1 起恢复平铺列表。
 *
 * v0.8.0 §16.4 曾把它改成按主题分卡片，§19.9 又给认不出的行留了个兜底桶再撤掉。
 * 但这一页在 §18 之后本来就**只在一个工作空间里**：标题就是这个主题，分组头
 * 「红楼梦 · 8 关在线 · 导出包」等于把页头抄了一遍。所以列表回到 v0.7 的形状 ——
 * 合辑一段、单局一段，一张卡，行即一切；「导出包」上移到页头（它本来就是
 * 主题级动作，页头才是它该在的地方）。
 *
 * 取消部署是**假删**（`deleted_at`）：玩家的 `/play/{slug}` 立刻打不开，但同一个
 * 访问路径可以再用。取消**合辑**下线不一样：它只删目录，那几关的单局仍然在线。
 */
export function DeploymentsPage(): JSX.Element {
  const workspace = useWorkspace();
  const gamesQuery = useGames();
  const deploymentsQuery = useThemeDeployments();
  const cancelMutation = useCancelGame();
  const removeDeployment = useRemoveDeployment();
  const [cancelTarget, setCancelTarget] = useState<MapGameSummary | null>(null);
  const [cancelCollection, setCancelCollection] = useState<ThemeDeploymentSummary | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
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

  const collections = useMemo(() => {
    const all = deploymentsQuery.data ?? [];
    return workspace ? all.filter((row) => row.themeCode === workspace.themeCode) : all;
  }, [deploymentsQuery.data, workspace]);

  const games = useMemo(() => {
    const all = gamesQuery.data ?? [];
    const scoped = workspace ? all.filter((game) => game.themeCode === workspace.themeCode) : all;
    // 已经进了合辑的单局不再重复列一遍：合辑行已经把它们算进去了。
    const inCollections = new Set(
      collections.flatMap((deployment) => deployment.entries.map((entry) => entry.puzzleId)),
    );
    return scoped.filter((game) => !inCollections.has(game.puzzleId));
  }, [gamesQuery.data, collections, workspace]);

  /**
   * 导出清单要的是**当前主题全部的在线关**，与上面列表的口径不同：
   * 列表为了不重复展示排掉了合辑里的关，包里却必须有它们。
   *
   * v0.8.2：原来这里直接把 `gamesQuery.data`（全站）交给导出弹窗 —— 清单会列出
   * 别的主题的关，而服务端只打当前主题，于是「清单 12 关、包里 8 关」；当前主题
   * 一关都没有时按钮还能点。包的范围由服务端定，界面就照同一把尺子取数。
   */
  const deployedGames = useMemo(() => {
    const all = gamesQuery.data ?? [];
    return workspace ? all.filter((game) => game.themeCode === workspace.themeCode) : [];
  }, [gamesQuery.data, workspace]);

  const versions = versionsQuery.data?.list ?? null;

  /**
   * 某个版本已经部署过 → 用那条部署回填（同一个版本再部署就是覆盖它）。
   * 传函数而不是预先算一张表：列表和版本列表各自刷新时，弹窗永远读到最新的那份。
   */
  const existingGameFor = (entry: PuzzleEntrySummary): MapGameSummary | null =>
    (gamesQuery.data ?? []).find((game) => game.puzzleId === entry.id) ?? null;

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
        className="flex items-center gap-4 border-b px-4 py-3"
      >
        <div className="w-48 shrink-0">
          <div className="truncate font-medium" title={deployment.name}>
            合辑「{deployment.name}」
          </div>
          <div className="truncate text-xs text-muted-foreground">目录 · {playable} 关</div>
        </div>
        <button
          type="button"
          onClick={() => copyPath(path, `collection-${deployment.slug}`)}
          title="复制完整访问路径"
          className="min-w-0 flex-1 truncate text-left font-mono text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          {path}
        </button>
        <span className="w-52 shrink-0 truncate text-right text-xs text-muted-foreground">
          {formatDateTime(deployment.createdAt)}
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

  /** 单局行：与 v0.7 的 64px 行同档 —— 缩略图 64×40、名称 192、弹性中列、时间 208、操作 160。 */
  function renderGameRow(game: MapGameSummary): JSX.Element {
    const initial = game.name.trim().charAt(0) || '游';
    const path = `/play/${game.slug}`;
    return (
      <div
        key={`game-${game.id}`}
        className="flex items-center gap-4 border-b px-4 py-3 last:border-b-0"
      >
        <span className="h-10 w-16 shrink-0 overflow-hidden rounded border bg-muted/40">
          {game.coverUrl ? (
            <img
              src={game.coverUrl}
              alt={game.name}
              draggable={false}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center bg-secondary/40 text-sm font-semibold text-muted-foreground/60">
              {initial}
            </span>
          )}
        </span>

        <div className="w-48 shrink-0">
          <div className="truncate font-medium" title={game.name}>
            {game.name}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            来源：{game.puzzleName} v{game.puzzleVersionNo}
          </div>
        </div>

        <DifficultyBadge difficulty={game.difficulty} />

        <span className="w-16 shrink-0 tabular-nums text-sm text-muted-foreground">
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

        <span className="w-52 shrink-0 truncate text-right text-xs text-muted-foreground">
          {formatDateTime(game.createdAt)}
        </span>

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
    if (gamesQuery.isLoading || deploymentsQuery.isLoading) {
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

    if (collections.length === 0 && games.length === 0) {
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
      <Card className="overflow-hidden">
        {collections.map(renderCollectionRow)}
        {games.map(renderGameRow)}
      </Card>
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
            `共 ${games.length} 个游戏在线。`
          )
        }
        actions={
          <>
            {workspace ? (
              /* v0.8.1：「导出包」从分组头挪到页头 —— 它是主题级动作，
                  在平铺列表里没有组头可挂了。 */
              <Button variant="outline" onClick={() => setExportOpen(true)}>
                <Package className="mr-1 h-4 w-4" />
                导出包
              </Button>
            ) : null}
            <Button onClick={() => setDeployOpen(true)}>
              <Rocket className="mr-1 h-3.5 w-3.5" />
              部署
            </Button>
          </>
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

      {/* v0.8.0 §16.10：导出先给清单，再给文件。弹窗的开关是 `theme` 是否为 null。 */}
      <ExportBundleDialog
        theme={exportOpen ? (workspace?.theme ?? null) : null}
        games={deployedGames}
        onOpenChange={(open) => {
          if (!open) setExportOpen(false);
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
