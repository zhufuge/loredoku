import { useEffect, useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { GameCard } from '@/components/game/GameCard';
import { BrandLogo } from '@/components/layout/BrandLogo';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { useThemeDeploymentBySlug } from '@/hooks/useThemes';

/**
 * v0.8.0（docs/v0.8.0.md §10 / §16.6）—— `/play/theme/:slug`：一个主题的关卡页。
 *
 * 三件事与「工坊里的主题页」刻意不同：
 *
 * 1. **没有 tab、没有计数、没有导出**：玩家不需要知道这个主题有多少资源。
 * 2. **顺序是作者的阅读顺序**（合辑的 `sort_order`），不是部署时间。
 * 3. **卡片指向 `/play/theme/:slug/:key`** —— 玩家从这一页点进第 3 关之后，
 *    游戏页上要有回到这个主题的入口（否则只能按浏览器返回）。
 *
 * 没有「下一关」这类强制串联：推理游戏允许玩家随便挑一关。
 */
export function ThemePlayPage(): JSX.Element {
  const { slug: slugParam } = useParams();
  const slug = slugParam && slugParam.length > 0 ? slugParam : null;
  const navigate = useNavigate();
  const query = useThemeDeploymentBySlug(slug);

  const deployment = query.data ?? null;
  /** 只有**还在线**的成员才摆卡片：取消上线的那一关不摆灰卡（§16.5）。 */
  const playable = useMemo(
    () => (deployment?.entries ?? []).filter((entry) => entry.game !== null),
    [deployment],
  );

  useEffect(() => {
    document.title = deployment ? `${deployment.name} · 格物` : '格物';
  }, [deployment]);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-6xl space-y-8 px-6 py-6">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-2">
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="-ml-2 h-8 gap-1 px-2 text-xs text-muted-foreground"
              >
                <Link to="/play">
                  <ArrowLeft className="h-3.5 w-3.5" />
                  全部游戏
                </Link>
              </Button>
              <BrandLogo height={16} />
            </div>
            <h1 className="truncate font-kai text-2xl leading-tight">
              {deployment?.name ?? '主题'}
            </h1>
            {deployment?.description ? (
              <p className="max-w-2xl text-sm text-muted-foreground">{deployment.description}</p>
            ) : null}
            {deployment ? (
              <p className="text-xs text-muted-foreground">{playable.length} 关可玩</p>
            ) : null}
          </div>
          <ThemeToggle className="h-9 w-9 shrink-0" />
        </div>

        {query.isLoading ? (
          <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="aspect-square w-full" />
            ))}
          </div>
        ) : query.isError || !deployment ? (
          <Card className="flex flex-col items-center gap-3 p-12 text-center">
            <Layers className="h-8 w-8 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">
              这个主题不在线，可能已经被作者下线了。
            </p>
            <Button variant="outline" onClick={() => navigate('/play')}>
              回到全部游戏
            </Button>
          </Card>
        ) : playable.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 p-12 text-center">
            <p className="text-sm text-muted-foreground">这个主题还没有可玩的关卡。</p>
            <Button variant="outline" onClick={() => navigate('/play')}>
              回到全部游戏
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-4">
            {playable.map((entry) =>
              entry.game ? (
                <GameCard
                  key={entry.game.id}
                  game={entry.game}
                  href={`/play/theme/${deployment.slug}/${entry.game.slug}`}
                />
              ) : null,
            )}
          </div>
        )}
      </div>
    </div>
  );
}
