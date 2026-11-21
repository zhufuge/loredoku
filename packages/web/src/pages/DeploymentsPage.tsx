import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Package, Rocket, Trash2 } from 'lucide-react';
import { type MapGameSummary, type PuzzleEntrySummary, stripSlugPrefix } from '@loredoku/shared';
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
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { InlineLoading, LoredokuTick } from '@/components/common/LoredokuLoader';

/** 部署模块（v0.7.1 §7.4）—— **一行 = 一条在线的东西**，列表是平铺的一张卡。 所以一张卡、行即一切； 「导出包」在页头（它本来 就是主题级动作）。 关卡顺序只剩 `sort_weight` 一列（v0.8.3 §6.2：顺序的唯一 真源）。；路径不是一个完整的地址，所以没有复制按钮 —— 复制它没有意义。 v0.8.5 §3：路径不显示 `puzzle-` 那段（`stripSlugPrefix`）。；名称下面没有「来源：xxx vN」那一行：部署页回答的是「在线的是什么」， 不是「它是从哪一版谜题生成的」—— 后者要追溯，去谜题列表看版本号。 */
export function DeploymentsPage(): JSX.Element {
  const workspace = useWorkspace();
  const gamesQuery = useGames();
  const cancelMutation = useCancelGame();
  const updateWeight = useUpdateGameWeight();
  const [cancelTarget, setCancelTarget] = useState<MapGameSummary | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [deployOpen, setDeployOpen] = useState(false);

  /** 部署弹窗要的版本列表。只取已发布的版本行（`kind: 'version'`）——草稿行部署不了，列出来只会让人点了才发现。100 条足够覆盖任何真实工坊。 §19：在工作空间里**只列这个主题的版本**。否则下拉里会混进别的主题的关， 部署完它落回自己那个主题 —— 作者在红楼梦里点了一个默认主题的谜题， 结果新游戏不出现在当前这一屏，看起来像「部署失败了」。 */
  const versionsQuery = usePuzzles({
    kind: 'version',
    pageSize: 100,
    sort: 'updatedAt',
    order: 'desc',
    ...(workspace ? { themeCode: workspace.themeCode } : {}),
  });

  useEffect(() => {
    document.title = workspace ? `${workspace.theme.name} · 部署 · 格物` : '部署 · 格物';
  }, [workspace]);

  const games = useMemo(() => {
    const all = gamesQuery.data ?? [];
    return workspace ? all.filter((game) => game.themeCode === workspace.themeCode) : all;
  }, [gamesQuery.data, workspace]);

  /** 导出清单要的是**当前主题全部的在线关** —— 包的范围由服务端定，界面就照同一把尺子取数。 把全站的 `gamesQuery.data` 交给导出弹窗，清单会列出别的主题的关，而服务端只打当前主题，于是「清单 12 关、包里 8 关」；当前主题一关都没有时按钮还能点。 */
  const deployedGames = useMemo(() => {
    const all = gamesQuery.data ?? [];
    return workspace ? all.filter((game) => game.themeCode === workspace.themeCode) : [];
  }, [gamesQuery.data, workspace]);

  const versions = versionsQuery.data?.list ?? null;

  /** 某个版本已经部署过 → 用那条部署回填（同一个版本再部署就是覆盖它）。 传函数而不是预先算一张表：列表和版本列表各自刷新时，弹窗永远读到最新的那份。 */
  const existingGameFor = (entry: PuzzleEntrySummary): MapGameSummary | null =>
    (gamesQuery.data ?? []).find((game) => game.puzzleId === entry.id) ?? null;

  /** 单局行：缩略图 64×40、名称 192、难度、尺寸 64、顺序 56、路径（弹性）、 时间 208、操作 160。 v0.8.5：路径只剩 slug。v0.8.5 §3：连 slug 里的 `puzzle-` 也剥掉 —— 列里的字只剩「这一关是谁」，完整地址在 `title` 里，要真打开就在右边那颗按钮上。 */
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
    if (gamesQuery.isLoading) {
      return (
        <div className="space-y-2">
          {/* 骨架高 64（= 行高），加载完成后整页不会往上跳。 */}
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

    if (games.length === 0) {
      return (
        // v0.7.8 §5：工坊五个列表页的空状态统一为「一句说明 + 一个主按钮」。
        // 按钮就是「部署」—— 空状态下一步要做的事。
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
              /* 「导出包」是主题级动作，放在页头。 */
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
    </section>
  );
}
