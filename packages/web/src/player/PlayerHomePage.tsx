import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { AlertTriangle, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { GameCard } from '@/components/game/GameCard';
import { BrandLogo } from '@/components/layout/BrandLogo';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import {
  bundleDifficultyTiers,
  bundleRoot,
  bundleStorageId,
  gameHrefOf,
  toGameCard,
} from './bundleLoad';
import { readGameCompletion, type GameCompletion } from '@/lib/gameCompletion';
import { useBundleManifest } from './PlayerBundleProvider';

/**
 * v0.9.0（docs/v0.9.0.md §6）—— 播放器的关卡列表页 `/loredoku/:code/play`。
 *
 * 与线上那个 `/play/theme/:slug` 长得像，但没有「全部游戏」的上一级（这个产物只有
 * 一个主题）、没有 `/themes` 查询、没有接口。数据只有一处：`manifest` —— 关卡清单是
 * `manifest.games`，难度分级的名字与颜色是 `manifest.theme.difficultyLevels`
 * （2026-11-09 补，见 §13）。线上那页要按 `themeCode` 去 `/themes` 查分级，这里
 * 不用：包本身就是那个主题，导出时已经把配置冻进来了。
 *
 * 卡片用同一张 `GameCard`（v0.9.0 §6 把它的入参收窄成五个字段），所以在工坊里
 * 改卡片长得什么样，播放器会跟着变 —— 两边不会各长一张脸。`tiers` 必须显式传：
 * 这一页在 `WorkspaceLayout` 外面，`DifficultyBadge` 不传就退回内置五档（v0.8.6 §3.6）。
 */
export function PlayerHomePage(): JSX.Element {
  const { code = '' } = useParams<{ code: string }>();
  const { data: manifest, isLoading, isError, error } = useBundleManifest(code);

  const games = useMemo(
    () => (manifest ? manifest.games.map((game) => toGameCard(game, bundleRoot(code))) : []),
    [manifest, code],
  );

  /**
   * 2026-11-09 补（docs/v0.9.0.md §13）：一份包一个主题，分级对每张卡都一样，
   * 所以算一次传下去，不在 `map` 里给每张卡重算。老包没这个键时
   * `resolveDifficultyTiers` 给内置五档 —— 与修复前的行为一致。
   */
  const tiers = useMemo(() => (manifest ? bundleDifficultyTiers(manifest) : undefined), [manifest]);

  /** 包的目录名与包里的身份对不上 —— 部署错了，不是玩家的问题，但得说清楚。 */
  const mismatched = manifest ? manifest.theme.code !== code : false;

  /**
   * v0.9.5：每张卡的通过记录。存档键是 `bundle:<主题code>:<key>`（与游戏页
   * `storageId` 同一条），所以**离线包的进度不会串到线上**，反之亦然。
   *
   * 指纹只有 `gridSize`：`manifest.games` 里正好有它，读一个坏记录的概率降到
   * 「网格变了」这一种 —— 那确实就是另一道题了。
   */
  const completions = useMemo(() => {
    const map = new Map<string, GameCompletion>();
    for (const game of manifest?.games ?? []) {
      const completion = readGameCompletion(bundleStorageId(code, game.key), {
        gridSize: game.gridSize,
      });
      if (completion) map.set(game.key, completion);
    }
    return map;
  }, [manifest, code]);

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
              <GameCard
                key={game.slug}
                game={game}
                tiers={tiers}
                href={gameHrefOf(code, game.slug)}
                completion={completions.get(game.slug) ?? null}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
