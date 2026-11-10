import { useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Gamepad2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InlineLoading } from '@/components/common/LoredokuLoader';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { GameCard } from '@/components/game/GameCard';
import { BrandLogo } from '@/components/layout/BrandLogo';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { useGames } from '@/hooks/useGames';
import { useDifficultyTiersByCode } from '@/hooks/useThemes';
import { readGameCompletion, type GameCompletion } from '@/lib/gameCompletion';
import { workshopPath } from '@/lib/workspace';

/**
 * v0.8.0（docs/v0.8.0.md §10 / §16.5）—— `/play` 曾是**两段互斥**：上面「主题大卡」，
 * 下面「单个游戏」；进了合辑的关不再在列表里出现，两段数量才对得上。
 *
 * v0.9.2：合辑（`theme_deployments`）连同两张表一起删了，那一段目录层没有落点了 ——
 * 这一页回到**一张列表**：在线的一关就是一张卡，点进去就玩。原来意义上的「主题」
 * 只剩一个不影响游玩的归属信息（`themeCode`，用来查难度叫法），不再是一个入口。
 *
 * 难度仍然按卡自己的 `themeCode` 去查（v0.8.6 §3.6）：这一页在工作空间外面，
 * `useWorkspace()` 是 `null`，徽章读不到主题的分级 —— 并排站着两个主题的关卡时，
 * 各显示各的叫法。
 */
export function GamesPage(): JSX.Element {
  const navigate = useNavigate();
  const gamesQuery = useGames();
  const tiersFor = useDifficultyTiersByCode();
  const games = useMemo(() => gamesQuery.data ?? [], [gamesQuery.data]);

  /**
   * v0.9.5：每张卡各自的通过记录。存档键就是游戏 slug（线上那一套，见
   * `lib/apiGameSource` 的 `storageId`），指纹只有 `gridSize`。
   *
   * 整份算一次而不是让卡片自己读：读 localStorage 是同步 I/O，二十几张卡各读一次
   * 就是二十几次序列化；而这里顺手得到一份「哪些关通过了」的表 —— 将来要写
   * 「已完成 3 / 8」这种计数时，它就在手边。
   */
  const completions = useMemo(() => {
    const map = new Map<string, GameCompletion>();
    for (const game of games) {
      const completion = readGameCompletion(game.slug, { gridSize: game.gridSize });
      if (completion) map.set(game.slug, completion);
    }
    return map;
  }, [games]);

  useEffect(() => {
    document.title = '格物';
  }, []);

  const loading = gamesQuery.isLoading;
  const error = gamesQuery.error;

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
                `${games.length} 个游戏可玩。`
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
        ) : games.length === 0 ? (
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
          <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-4">
            {games.map((game) => (
              <GameCard
                key={game.id}
                game={game}
                tiers={tiersFor(game.themeCode)}
                completion={completions.get(game.slug) ?? null}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
