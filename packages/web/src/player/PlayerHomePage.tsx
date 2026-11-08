import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { AlertTriangle, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { GameCard } from '@/components/game/GameCard';
import { BrandLogo } from '@/components/layout/BrandLogo';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { bundleRoot, gameHrefOf, toGameCard } from './bundleLoad';
import { useBundleManifest } from './PlayerBundleProvider';

/**
 * v0.9.0（docs/v0.9.0.md §6）—— 播放器的关卡列表页 `/loredoku/:code/play`。
 *
 * 与线上那个 `/play/theme/:slug` 长得像，但**一件东西都没有**：没有「全部游戏」
 * 的上一级（这个产物只有一个主题）、没有难度分级查询（分级阈值不在包里，见
 * 代价 §9.3）、没有接口。数据只有一处：`manifest.games`。
 *
 * 卡片用同一张 `GameCard`（v0.9.0 §6 把它的入参收窄成五个字段），所以在工坊里
 * 改卡片长得什么样，播放器会跟着变 —— 两边不会各长一张脸。
 */
export function PlayerHomePage(): JSX.Element {
  const { code = '' } = useParams<{ code: string }>();
  const { data: manifest, isLoading, isError, error } = useBundleManifest(code);

  const games = useMemo(
    () => (manifest ? manifest.games.map((game) => toGameCard(game, bundleRoot(code))) : []),
    [manifest, code],
  );

  /** 包的目录名与包里的身份对不上 —— 部署错了，不是玩家的问题，但得说清楚。 */
  const mismatched = manifest ? manifest.theme.code !== code : false;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-6xl space-y-8 px-6 py-6">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <BrandLogo height={16} />
            <h1 className="truncate font-kai text-2xl leading-tight">
              {manifest?.theme.name ?? '主题'}
            </h1>
            {manifest?.theme.description ? (
              <p className="max-w-2xl text-sm text-muted-foreground">
                {manifest.theme.description}
              </p>
            ) : null}
            {manifest ? (
              <p className="text-xs text-muted-foreground">{manifest.games.length} 关可玩</p>
            ) : null}
          </div>
          <ThemeToggle className="h-9 w-9 shrink-0" />
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="aspect-square w-full" />
            ))}
          </div>
        ) : isError ? (
          <Card className="flex flex-col items-center gap-3 p-12 text-center">
            <AlertTriangle className="h-8 w-8 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">
              这个播放器里没有「{code}」这个主题的资源包。
            </p>
            <p className="max-w-md text-xs text-muted-foreground/70">
              {error instanceof Error ? error.message : '资源包读不出来'}
            </p>
            <p className="max-w-md text-xs text-muted-foreground/70">
              包要用 <code className="font-mono">--bundle</code> 交给构建（见 docs/v0.9.0.md），
              并且放在产物的 <code className="font-mono">{code}/</code> 目录下。
            </p>
          </Card>
        ) : mismatched ? (
          <Card className="flex flex-col items-center gap-3 p-12 text-center">
            <AlertTriangle className="h-8 w-8 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">
              这个目录里装的不是「{code}」的包 —— 包里写的是「{manifest?.theme.code}」。
            </p>
          </Card>
        ) : games.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 p-12 text-center">
            <Layers className="h-8 w-8 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">这个主题还没有可玩的关卡。</p>
            <Button variant="outline" onClick={() => window.location.reload()}>
              重新加载
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-4">
            {games.map((game) => (
              <GameCard key={game.slug} game={game} href={gameHrefOf(code, game.slug)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
