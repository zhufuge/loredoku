import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Folder, Package, Rocket, Trash2 } from 'lucide-react';
import {
  type MapGameSummary,
  type PuzzleEntrySummary,
  type ThemeDeploymentSummary,
  stripSlugPrefix,
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
import { SortWeightCell } from '@/components/game/SortWeightCell';
import { ExportBundleDialog } from '@/components/theme/ExportBundleDialog';
import { useCancelGame, useGames, useUpdateGameWeight } from '@/hooks/useGames';
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
 *
 * v0.8.5：这一行不再承担「给你一条可复制的链接」。
 * - 路径只显示**尾部**（`puzzle-xxxx`），前缀 `/play/` 在每一行都一样，占着最宽的
 *   一列却不提供任何信息；要真去玩，右边那颗新标签页按钮一直在。
 * - 复制按钮与「已复制」勾号一起撤掉 —— 路径已经不是一个完整的地址，复制它没有意义。
 * - 多了一列「顺序」（`sort_weight`）：点开就地改，回车或失焦时**值真的变了**才写回。
 *
 * v0.8.5 §3：路径连 `puzzle-` 那一段也不显示了（`stripSlugPrefix`）。
 * - 它是 v0.4.1 给 `/play/` 底下留的命名空间，不是这一关的信息 —— 每行都以它开头，
 *   读起来像页头的复读。地址本身没变，完整路径仍在 `title` 里。
 * - 同一次改动把名称下面那行「来源：xxx vN」撤了：部署页回答的是「在线的是什么」，
 *   不是「它是从哪一版谜题生成的」—— 后者要追溯，去谜题列表看版本号。
 */
export function DeploymentsPage(): JSX.Element {
  const workspace = useWorkspace();
  const gamesQuery = useGames();
  const deploymentsQuery = useThemeDeployments();
  const cancelMutation = useCancelGame();
  const removeDeployment = useRemoveDeployment();
  const updateWeight = useUpdateGameWeight();
  const [cancelTarget, setCancelTarget] = useState<MapGameSummary | null>(null);
  const [cancelCollection, setCancelCollection] = useState<ThemeDeploymentSummary | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
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

  function renderCollectionRow(deployment: ThemeDeploymentSummary): JSX.Element {
    const playable = deployment.entries.filter((entry) => entry.game !== null).length;
    const path = `/play/theme/${deployment.slug}`;
    return (
      <div
        key={`collection-${deployment.id}`}
        className="flex items-center gap-4 border-b px-4 py-3"
      >
        {/* 与单局行同一个 64×40 的位：两行的名称列因此从同一个 x 起，读起来是一张表。 */}
        <span className="flex h-10 w-16 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted/40">
          <Folder className="h-4 w-4 text-muted-foreground/60" />
        </span>

        <div className="w-48 shrink-0">
          <div className="truncate font-medium" title={deployment.name}>
            合辑「{deployment.name}」
          </div>
          <div className="truncate text-xs text-muted-foreground">目录 · {playable} 关</div>
        </div>

        {/* 合辑没有自己的权重 —— 内部仍按 `sort_order`，这一格留空而不是给 0。 */}
        <span className="w-14 shrink-0" />

        <span
          className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground"
          title={`/play/theme/${deployment.slug}`}
        >
          {stripSlugPrefix(deployment.slug)}
        </span>

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
   * 单局行：缩略图 64×40、名称 192、难度、尺寸 64、顺序 56、路径（弹性）、
   * 时间 208、操作 160。
   *
   * v0.8.5：路径只剩 slug。v0.8.5 §3：连 slug 里的 `puzzle-` 也剥掉 —— 列里的字
   * 只剩「这一关是谁」，完整地址在 `title` 里，要真打开就在右边那颗按钮上。
   */
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
        </div>

        <DifficultyBadge difficulty={game.difficulty} />

        <span className="w-16 shrink-0 tabular-nums text-sm text-muted-foreground">
          {game.gridSize} × {game.gridSize}
        </span>

        <SortWeightCell
          value={game.sortWeight}
          pending={updateWeight.isPending && updateWeight.variables?.id === game.id}
          onCommit={(sortWeight) => updateWeight.mutate({ id: game.id, sortWeight })}
        />

        <span
          className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground"
          title={path}
        >
          {stripSlugPrefix(game.slug)}
        </span>

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
