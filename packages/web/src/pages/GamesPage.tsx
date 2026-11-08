import { useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Gamepad2, Layers } from 'lucide-react';
import type { MapGameSummary, ThemeDeploymentSummary } from '@loredoku/shared';
import { Button } from '@/components/ui/button';
import { InlineLoading } from '@/components/common/LoredokuLoader';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { GameCard } from '@/components/game/GameCard';
import { BrandLogo } from '@/components/layout/BrandLogo';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { useGames } from '@/hooks/useGames';
import { useDifficultyTiersByCode, useThemeDeployments } from '@/hooks/useThemes';
import { workshopPath } from '@/lib/workspace';

/**
 * v0.8.0（docs/v0.8.0.md §10 / §16.5）—— `/play` 是**两段互斥**，不是「主题大卡 +
 * 单局列表不变」。
 *
 * 按前一种写法，红楼梦的 8 关会出现两次：一次在大卡的「8 关」里，一次在下面
 * 8 张卡里。玩家不知道该点哪个，而且两处数量还对不上（大卡算的是部署数，
 * 列表里只列还在线的）。
 *
 * - 单局段只列**不属于任何已上线合辑**的游戏，两段互斥，数量自然对得上；
 * - 大卡上写「6 关可玩」，不写「已部署 6 关」——「部署」是工坊话，玩家不懂；
 * - 合辑里某关被取消上线后，成员行还在（§9 的设计），卡片按**可玩数**算，
 *   不摆灰卡。
 */
export function GamesPage(): JSX.Element {
  const navigate = useNavigate();
  const gamesQuery = useGames();
  const deploymentsQuery = useThemeDeployments();
  /**
   * v0.8.6 §3.6：这一页在工作空间外面，徽章读不到主题的分级 —— 每张卡按它自己的
   * `themeCode` 去查。单局段里可能并排站着两个主题的关卡，各显示各的叫法。
   */
  const tiersFor = useDifficultyTiersByCode();
  const games = useMemo(() => gamesQuery.data ?? [], [gamesQuery.data]);
  const deployments = useMemo(() => deploymentsQuery.data ?? [], [deploymentsQuery.data]);

  /**
   * 已经进了某个合辑的**谜题**不再出现在单局段。
   *
   * 按 `puzzleId` 而不是 `gameId` 去重：同一个谜题版本只会有一个 game 行，
   * 但合辑的成员行存的是 `puzzleId`（§9），两边只有这个键对得上。
   */
  const inCollections = useMemo(() => {
    const set = new Set<number>();
    for (const deployment of deployments) {
      for (const entry of deployment.entries) set.add(entry.puzzleId);
    }
    return set;
  }, [deployments]);

  const singles = useMemo(
    () => games.filter((game) => !inCollections.has(game.puzzleId)),
    [games, inCollections],
  );

  const playableCount = (deployment: ThemeDeploymentSummary): number =>
    deployment.entries.filter((entry) => entry.game !== null).length;

  useEffect(() => {
    document.title = '格物';
  }, []);

  const loading = gamesQuery.isLoading || deploymentsQuery.isLoading;
  const error = gamesQuery.error ?? deploymentsQuery.error;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-7xl space-y-8 px-6 py-6">
        <div className="flex items-end justify-between gap-4">
          <div className="space-y-1">
            <BrandLogo height={22} withWordmark />
            <p className="text-xs text-muted-foreground">
              {loading ? (
                <InlineLoading caption="正在加载游戏…" />
              ) : (
                `${deployments.length} 个主题 · ${games.length} 个游戏可玩。`
              )}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle className="h-9 w-9" />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              /*
               * v0.8.2：进工坊落到**概览**，不是地图。
               *
               * v0.8.0 给每个工作空间配了自己的首页（`/:code/overview`），导航第一项
               * 也是它；只有这枚从玩家侧进来的门还落在地图 —— 两处对「工坊的首页」
               * 说法不一致。概览本来就是回答「这个空间是什么、有什么」的那一页，
               * 从外面进来先看它，比先看一张画布合理。
               */
              onClick={() => navigate(workshopPath('overview'))}
              title="进入工坊（制作端）"
            >
              进入工坊
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="aspect-square w-full" />
            ))}
          </div>
        ) : error ? (
          <Card className="flex flex-col items-center gap-3 p-12 text-center">
            <p className="text-sm text-muted-foreground">
              {error instanceof Error ? error.message : '加载失败'}
            </p>
            <Button variant="outline" onClick={() => void gamesQuery.refetch()}>
              重试
            </Button>
          </Card>
        ) : games.length === 0 && deployments.length === 0 ? (
          <Card className="mx-auto flex max-w-md flex-col items-center gap-4 p-12 text-center">
            <Gamepad2 className="h-10 w-10 text-muted-foreground/60" />
            <CardContent className="space-y-1 p-0">
              <p className="font-medium">还没有部署任何游戏</p>
              <p className="text-sm text-muted-foreground">
                去谜题列表把谜题部署为游戏，就能在这里开始游玩。
              </p>
            </CardContent>
            <Button asChild variant="outline">
              <Link to={workshopPath('puzzles')}>前往谜题列表</Link>
            </Button>
          </Card>
        ) : (
          <>
            {deployments.length > 0 ? (
              <section className="space-y-3">
                <h2 className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
                  主题
                </h2>
                <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  {deployments.map((deployment) => (
                    <ThemeCollectionCard
                      key={deployment.id}
                      deployment={deployment}
                      playable={playableCount(deployment)}
                      onOpen={() => navigate(`/play/theme/${deployment.slug}`)}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {singles.length > 0 ? (
              <section className="space-y-3">
                <h2 className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
                  单个游戏
                </h2>
                <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-4">
                  {singles.map((game) => (
                    <GameCard key={game.id} game={game} tiers={tiersFor(game.themeCode)} />
                  ))}
                </div>
              </section>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * 主题大卡：封面 + 名称 + 「n 关可玩」+ 描述。
 *
 * 不做 `GameCard` 的变体：那一张的单位是「一关」，这一张的单位是「一串关」，
 * 两者的第一行信息（难度 / 关数）就不一样，硬套会得到一个两边都不像的卡。
 */
function ThemeCollectionCard({
  deployment,
  playable,
  onOpen,
}: {
  deployment: ThemeDeploymentSummary;
  playable: number;
  onOpen: () => void;
}): JSX.Element {
  const initial = deployment.name.trim().charAt(0) || '主';
  // 成员数 > 可玩数时说明还有关在准备 —— 说出来，别让玩家数不明白。
  const preparing = deployment.entries.length - playable;

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
      className="group cursor-pointer overflow-hidden transition-[box-shadow,border-color] duration-base ease-out hover:border-primary/30 hover:shadow-lifted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="relative isolate aspect-[16/7] w-full overflow-hidden border-b bg-muted/50">
        {deployment.coverUrl ? (
          <img
            src={deployment.coverUrl}
            alt={deployment.name}
            draggable={false}
            className="h-full w-full object-cover transition-transform duration-image ease-in-out group-hover:scale-[1.06]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Layers className="h-8 w-8 text-muted-foreground/40" />
          </div>
        )}
      </div>
      <div className="space-y-2 p-4">
        <h3 className="truncate font-kai text-lg" title={deployment.name}>
          {deployment.name}
        </h3>
        <p className="text-xs text-muted-foreground">
          {playable} 关可玩
          {preparing > 0 ? ` · 还有 ${preparing} 关在准备` : ''}
        </p>
        {deployment.description ? (
          <p className="line-clamp-2 text-xs text-muted-foreground">{deployment.description}</p>
        ) : null}
      </div>
    </Card>
  );
}

/** 供主题播放页复用：一个 `MapGameSummary` 在主题里的地址。 */
export function themeGameHref(themeSlug: string, game: MapGameSummary): string {
  return `/play/theme/${themeSlug}/${game.slug}`;
}
