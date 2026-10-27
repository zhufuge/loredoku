import { useEffect } from 'react';
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

export function GamesPage(): JSX.Element {
  const navigate = useNavigate();
  const gamesQuery = useGames();
  const games = gamesQuery.data ?? [];

  useEffect(() => {
    document.title = '格物';
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-7xl space-y-6 px-6 py-6">
        <div className="flex items-end justify-between gap-4">
          <div className="space-y-1">
            <BrandLogo height={22} withWordmark />
            <p className="text-xs text-muted-foreground">
              {gamesQuery.isLoading ? (
                <InlineLoading caption="正在加载游戏…" />
              ) : (
                `已部署 ${games.length} 个游戏，选择一张地图开始推理。`
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
              onClick={() => navigate('/maps')}
              title="进入工坊（制作端）"
            >
              进入工坊
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {gamesQuery.isLoading ? (
          <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="aspect-square w-full" />
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
