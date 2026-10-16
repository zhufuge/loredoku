import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Gamepad2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { GameCard } from '@/components/game/GameCard';
import { useGames } from '@/hooks/useGames';

/**
 * FEAT-G01 (docs/v0.4.0.md §4): the games home. A player-facing entry, kept
 * deliberately plain — a card grid with nothing but the four facts a player
 * needs (cover / name / difficulty / n×n) before clicking in.
 *
 * v0.4.0 验收补充：它是**独立顶层路由**，不用 `AppShell`——玩家从这里看不到
 * 地图 / 物品 / 角色 / 谜题等制作端模块，只能通过链接（谜题页「已部署」徽标、
 * 游戏页「返回」按钮）进来，所以页面自带整版布局。
 */
export function GamesPage(): JSX.Element {
  const gamesQuery = useGames();
  const games = gamesQuery.data ?? [];

  useEffect(() => {
    document.title = '游戏 · 格物';
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-7xl space-y-6 px-6 py-6">
        <div>
          <h1 className="text-xl font-semibold">游戏</h1>
          <p className="text-xs text-muted-foreground">
            {gamesQuery.isLoading
              ? '正在加载游戏…'
              : `已部署 ${games.length} 个游戏，选择一张地图开始推理。`}
          </p>
        </div>

        {gamesQuery.isLoading ? (
          <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="aspect-[4/3] w-full" />
            ))}
          </div>
        ) : gamesQuery.isError ? (
          <Card className="flex flex-col items-center gap-3 p-12 text-center">
            <p className="text-sm text-muted-foreground">
              {gamesQuery.error instanceof Error ? gamesQuery.error.message : '加载失败'}
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
              <Link to="/puzzles">前往谜题列表</Link>
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-4">
            {games.map((game) => (
              <GameCard key={game.id} game={game} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
