import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertTriangle, Layers } from 'lucide-react';
import { resolveGameListTexts } from '@loredoku/shared';
import { Button } from '@/components/ui/button';
import { GameListShell } from '@/components/game/GameListShell';
import { GameCard } from '@/components/game/GameCard';
import {
  bundleDifficultyTiers,
  bundleRoot,
  bundleStorageId,
  gameHrefOf,
  toGameCard,
} from './bundleLoad';
import { readGameCompletion, type GameCompletion } from '@/lib/gameCompletion';
import { readLastLeftAt, readLastLeftElapsed } from '@/lib/gameTimer';
import { useBundledFontsReady } from '@/hooks/useBundledFontsReady';
import { useImagePreload } from '@/hooks/useImagePreload';
import { gameCoverUrls } from '@/lib/pageImages';
import { useBundleManifest } from './PlayerBundleProvider';

/**
 * v0.9.0（docs/v0.9.0.md §6）—— 播放器的关卡列表页 `/loredoku/:code/play`：数据只有 `manifest`（`games` + `theme.difficultyLevels`，2026-11-09 补 §13），没有 `/themes` 查询。`tiers` 必须显式传 —— 这页在 `WorkspaceLayout` 外，不传 `DifficultyBadge` 就退回内置五档（v0.8.6 §3.6）。
 *
 * v0.11.10：骨架交给 `GameListShell` —— 与工坊的 `/:code/play` 同一张脸。两边的差别只剩数据从哪来
 * （`/games` + `/themes` vs 一份 `manifest`）与没有「进入工坊」的出口。
 */
export function PlayerHomePage(): JSX.Element {
  const { code = '' } = useParams<{ code: string }>();
  const { data: manifest, isLoading, isError, error } = useBundleManifest(code);

  const games = useMemo(
    () => (manifest ? manifest.games.map((game) => toGameCard(game, bundleRoot(code))) : []),
    [manifest, code],
  );

  /** 2026-11-09 补（docs/v0.9.0.md §13）：一份包一个主题，分级对每张卡都一样， 所以算一次传下去，不在 `map` 里给每张卡重算。老包没这个键时 `resolveDifficultyTiers` 给内置五档 —— 与修复前的行为一致。 */
  const tiers = useMemo(() => (manifest ? bundleDifficultyTiers(manifest) : undefined), [manifest]);

  /** 包的目录名与包里的身份对不上 —— 部署错了，不是玩家的问题，但得说清楚。 */
  const mismatched = manifest ? manifest.theme.code !== code : false;

  /** 每张卡的通过记录。存档键是 `bundle:<主题code>:<key>`（与游戏页 `storageId` 同一条），所以**离线包的进度不会串到线上**，反之亦然。 指纹只有 `gridSize`：`manifest.games` 里正好有它，读一个坏记录的概率降到「网格变了」这一种 —— 那确实就是另一道题了。 */
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

  /** 最后离开时间（键同 storageId，走 undleStorageId）。 */
  const lastLeft = useMemo(() => {
    const map = new Map<string, { elapsedMs: number; at: string | null }>();
    for (const game of manifest?.games ?? []) {
      const id = bundleStorageId(code, game.key);
      const elapsedMs = readLastLeftElapsed(id, { gridSize: game.gridSize });
      if (elapsedMs === null) continue;
      map.set(game.key, { elapsedMs, at: readLastLeftAt(id, { gridSize: game.gridSize }) });
    }
    return map;
  }, [manifest, code]);

  /** 两行字（「N 关可玩」/「已通过 N 关」）由主题配置，包导出时已经冻进 `manifest.theme.gameList`；没配过就退回内置那两句。与工坊那边同一份解析， 免得同一句话在两处长得不一样。 */
  const texts = useMemo(() => resolveGameListTexts(manifest?.theme.gameList), [manifest]);

  /** 难度过滤。默认「全部」—— 玩家第一次进来该看到所有关，而不是被按在一个档位上。「已通过 N 关」跟着**全部**走：切档不该让这个数字变小。 */
  const [difficulty, setDifficulty] = useState<number | null>(null);
  const visibleGames = useMemo(
    () => (difficulty === null ? games : games.filter((game) => game.difficulty === difficulty)),
    [games, difficulty],
  );

  /**
   * 包 + 字体 + 封面都齐了才一次画成，中途只亮整屏品牌字标（不是骨架屏）；只等**当前这一档**的封面，切档不为别的档再挡一次屏（`useImagePreload` 契约：封面都到 / 出错都算完）。
   */
  const fontsReady = useBundledFontsReady();
  const coversReady = useImagePreload(gameCoverUrls(visibleGames));
  const loading = isLoading || !fontsReady || (visibleGames.length > 0 && !coversReady);

  /** 包读不出来是配置错误，那一刻已经没什么可等 —— 立刻把原因说清楚，别让玩家对着字标等一份永远不会到的包。 */
  const failed = isError || mismatched;

  return (
    <GameListShell
      themeName={manifest?.theme.name ?? null}
      description={manifest?.theme.description ?? null}
      titleFontFamily={manifest?.theme.fontFamily ?? null}
      texts={texts}
      allCount={games.length}
      passedCount={completions.size}
      tiers={tiers}
      difficulty={difficulty}
      onDifficultyChange={setDifficulty}
      games={visibleGames}
      loading={loading && !failed}
      loadingCaption="正在加载游戏…"
      error={isError ? (error ?? new Error('资源包读不出来')) : undefined}
      errorContent={
        isError ? (
          <>
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
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            这个目录里装的不是「{code}」的包 —— 包里写的是「{manifest?.theme.code}」。
          </p>
        )
      }
      emptyContent={
        <>
          <Layers className="h-8 w-8 text-muted-foreground/60" />
          <p className="text-sm text-muted-foreground">这个主题还没有可玩的关卡。</p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            重新加载
          </Button>
        </>
      }
      renderGame={(game) => (
        <GameCard
          game={game}
          tiers={tiers}
          href={gameHrefOf(code, game.slug)}
          completion={completions.get(game.slug) ?? null}
          lastLeftAt={lastLeft.get(game.slug)?.at ?? null}
          lastLeftElapsedMs={lastLeft.get(game.slug)?.elapsedMs ?? null}
        />
      )}
    />
  );
}
