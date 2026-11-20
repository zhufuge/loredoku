import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Gamepad2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InlineLoading } from '@/components/common/LoredokuLoader';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { GameCard } from '@/components/game/GameCard';
import { DifficultyFilter } from '@/components/game/DifficultyFilter';
import { BrandLogo } from '@/components/layout/BrandLogo';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { useGames } from '@/hooks/useGames';
import { useImagePreload } from '@/hooks/useImagePreload';
import { useThemes } from '@/hooks/useThemes';
import { resolveDifficultyTiers, resolveGameListTexts, formatGameListCount } from '@loredoku/shared';
import { readGameCompletion, type GameCompletion } from '@/lib/gameCompletion';
import { readLastLeftAt, readLastLeftElapsed } from '@/lib/gameTimer';
import { gameCoverUrls } from '@/lib/pageImages';
import { workshopPath } from '@/lib/workspace';

/**
 * v0.8.0（docs/v0.8.0.md §10 / §16.5）—— `/play` 曾是**两段互斥**：上面「主题大卡」，
 * 下面「单个游戏」；进了合辑的关不再在列表里出现，两段数量才对得上。
 *
 * v0.9.2：合辑（`theme_deployments`）连同两张表一起删了，那一段目录层没有落点了 ——
 * 这一页回到**一张列表**：在线的一关就是一张卡，点进去就玩。
 *
 * v0.11.6：这一页从「全站一张平铺表」改成**一个主题一张表**（`/:code/play`），
 * 与播放器里那页同一副骨架 —— 同一批关卡在两个入口里长得一样，玩家不必猜
 * 「线上那版和工坊这版是不是同一个东西」。地址里的编码就是筛选条件，于是：
 * 主题名成了标题，难度分级只列**这个主题**那几档，工坊的门也落在这个主题上。
 */
export function GamesPage(): JSX.Element {
  const navigate = useNavigate();
  const params = useParams<{ themeCode?: string }>();
  const code = params.themeCode ?? null;

  const gamesQuery = useGames();
  const themesQuery = useThemes();
  const theme = useMemo(
    () => (themesQuery.data ?? []).find((candidate) => candidate.code === code) ?? null,
    [themesQuery.data, code],
  );

  /**
   * 地址里的编码就是筛选条件。`code` 缺席（单测、或有人手敲了一条没有主题段的
   * 旧地址）时退回「全站」—— 那条老地址由路由表重定向，这里只是兜底。
   */
  const allGames = useMemo(
    () => (gamesQuery.data ?? []).filter((game) => code === null || game.themeCode === code),
    [gamesQuery.data, code],
  );

  /** 「全部」= `null`；其余是主题里某一档的 `level`。 */
  const [difficulty, setDifficulty] = useState<number | null>(null);
  const games = useMemo(
    () =>
      difficulty === null
        ? allGames
        : allGames.filter((game) => game.difficulty === difficulty),
    [allGames, difficulty],
  );

  const tiers = useMemo(() => resolveDifficultyTiers(theme?.data.difficultyLevels), [theme]);
  const texts = useMemo(() => resolveGameListTexts(theme?.data.gameList), [theme]);

  /**
   * v0.11.2：loading 等「当前页资源全部加载完」才撤。列表页的资源就是每张卡的
   * 封面图 —— 数据到齐且封面都预加载完，骨架屏才换成卡片，中间不会出现
   * 「卡片先出、封面一张张跳出来」的那一帧。没有封面的卡视为已加载。
   *
   * v0.11.6：只等**当前这一档**的封面 —— 切到某一档不该等别的档的图。
   */
  const coversReady = useImagePreload(gameCoverUrls(games));
  const loading =
    gamesQuery.isLoading || themesQuery.isLoading || (games.length > 0 && !coversReady);

  /**
   * v0.9.6：每一关的**最后离开时间**。它与通过记录分两条键（完成是既成事实、
   * 离开是上次玩到几点），所以这里分开算一张表；卡片按「完成优先，否则离开」
   * 自己挑一个。
   */
  const lastLeft = useMemo(() => {
    const map = new Map<string, { elapsedMs: number; at: string | null }>();
    for (const game of allGames) {
      const elapsedMs = readLastLeftElapsed(game.slug, { gridSize: game.gridSize });
      if (elapsedMs === null) continue;
      map.set(game.slug, {
        elapsedMs,
        at: readLastLeftAt(game.slug, { gridSize: game.gridSize }),
      });
    }
    return map;
  }, [allGames]);

  /** v0.9.5：每张卡各自的通过记录（键是游戏 slug）。 */
  const completions = useMemo(() => {
    const map = new Map<string, GameCompletion>();
    for (const game of allGames) {
      const completion = readGameCompletion(game.slug, { gridSize: game.gridSize });
      if (completion) map.set(game.slug, completion);
    }
    return map;
  }, [allGames]);

  useEffect(() => {
    document.title = theme ? `${theme.name} · 格物` : '格物';
  }, [theme]);

  const error = gamesQuery.error ?? themesQuery.error;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-5 sm:space-y-8 sm:px-6 sm:py-6">
        <div className="flex flex-wrap items-end justify-between gap-3 sm:gap-4">
          <div className="space-y-1">
            <BrandLogo height={22} withWordmark />
            {loading ? (
              <p className="text-xs text-muted-foreground">
                <InlineLoading caption="正在加载游戏…" />
              </p>
            ) : null}
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
               *
               * v0.11.6：带上主题编码 —— 从 A 主题的列表页进工坊，该落到 A 的概览，
               * 而不是「上一次待过的那个主题」。
               */
              onClick={() => navigate(workshopPath('overview', code))}
              title="进入工坊（制作端）"
            >
              进入工坊
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/*
         * v0.11.6：主题这一层信息 —— 名字、一句话介绍、两行计数。
         * 与播放器里那页同一个次序：先回答「这是哪个世界」，再回答「有多少关」。
         */}
        <div className="space-y-2">
          <h1 className="font-serif text-2xl font-semibold tracking-tight sm:text-3xl">
            {theme?.name ?? '游戏'}
          </h1>
          {theme?.description ? (
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {theme.description}
            </p>
          ) : null}
          {loading ? null : (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>{formatGameListCount(texts.playable, allGames.length)}</span>
              <span aria-hidden className="text-border">
                ·
              </span>
              <span data-testid="games-passed-count">
                {formatGameListCount(texts.passed, completions.size)}
              </span>
            </p>
          )}
        </div>

        {/*
         * v0.11.6：难度过滤。「全部」在前，后面是**这个主题**的分级 —— 分级是主题
         * 自己定的，别的主题的档名在这里没有意义。零关的档也列出来：它回答的是
         * 「这个主题有哪几档」，藏起来反而让人以为分级少了。
         */}
        {loading || error || allGames.length === 0 ? null : (
          <DifficultyFilter tiers={tiers} value={difficulty} onChange={setDifficulty} />
        )}

        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="aspect-square w-full" />
            ))}
          </div>
        ) : error ? (
          <Card className="flex flex-col items-center gap-3 p-8 text-center sm:p-12">
            <p className="text-sm text-muted-foreground">
              {error instanceof Error ? error.message : '加载失败'}
            </p>
            <Button variant="outline" onClick={() => void gamesQuery.refetch()}>
              重试
            </Button>
          </Card>
        ) : allGames.length === 0 ? (
          <Card className="mx-auto flex max-w-md flex-col items-center gap-4 p-8 text-center sm:p-12">
            <Gamepad2 className="h-10 w-10 text-muted-foreground/60" />
            <CardContent className="space-y-1 p-0">
              <p className="font-medium">这个主题还没有部署任何游戏</p>
              <p className="text-sm text-muted-foreground">
                去谜题列表把谜题部署为游戏，就能在这里开始游玩。
              </p>
            </CardContent>
            <Button asChild variant="outline">
              <Link to={workshopPath('puzzles', code)}>前往谜题列表</Link>
            </Button>
          </Card>
        ) : games.length === 0 ? (
          /*
           * 过滤之后空了 —— 与「这个主题一关都没有」是两件事：前者换个档就有，
           * 后者要去工坊。混成一句会把人送去错误的地方。
           */
          <Card className="flex flex-col items-center gap-3 p-8 text-center sm:p-12">
            <p className="text-sm text-muted-foreground">这一档还没有关卡。</p>
            <Button variant="outline" size="sm" onClick={() => setDifficulty(null)}>
              看全部
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 xl:grid-cols-4">
            {games.map((game) => (
              <GameCard
                key={game.id}
                game={game}
                /* v0.11.6：卡片的落点也带主题段 —— 与列表页同一个世界。 */
                href={code ? `/${code}/play/${game.slug}` : `/play/${game.slug}`}
                tiers={tiers}
                completion={completions.get(game.slug) ?? null}
                lastLeftAt={lastLeft.get(game.slug)?.at ?? null}
                lastLeftElapsedMs={lastLeft.get(game.slug)?.elapsedMs ?? null}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
