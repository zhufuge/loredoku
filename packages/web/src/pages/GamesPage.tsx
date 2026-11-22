import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Gamepad2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InlineLoading } from '@/components/common/LoredokuLoader';
import { PetalField } from '@/components/common/PetalField';
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

/** 这一页是**一个主题一张表**（`/:code/play`，docs/v0.8.0.md §10 / §16.5），与播放器里那页同一副骨架 —— 同一批关卡在两个入口里长得一样，玩家不必猜「线上那版和工坊这版是不是同一个东西」。地址里的编码就是筛选条件，于是：主题名成了标题，难度分级只列**这个主题**那几档，工坊的门也落在这个主题上。 */
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

  /** 地址里的编码就是筛选条件。`code` 缺席（单测、或有人手敲了一条没有主题段的旧地址）时退回「全站」—— 那条老地址由路由表重定向，这里只是兜底。 */
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

  /** loading 等「当前页资源全部加载完」才撤。列表页的资源就是每张卡的封面图 —— 数据到齐且封面都预加载完，骨架屏才换成卡片，中间不会出现「卡片先出、封面一张张跳出来」的那一帧。没有封面的卡视为已加载。 只等**当前这一档**的封面 —— 切到某一档不该等别的档的图。 */
  const coversReady = useImagePreload(gameCoverUrls(games));
  const loading =
    gamesQuery.isLoading || themesQuery.isLoading || (games.length > 0 && !coversReady);

  /** 每一关的**最后离开时间**。它与通过记录分两条键（完成是既成事实、 离开是上次玩到几点），所以这里分开算一张表；卡片按「完成优先，否则离开」 自己挑一个。 */
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

  /** 每张卡各自的通过记录（键是游戏 slug）。 */
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

  /** 页头有多高，卡片区就钉在它下沿。 */
  const [pinnedHeight, setPinnedHeight] = useState(0);
  /** 卡片比一屏多出来的高度，补给页面 —— 全局滚动条才够长。 */
  const [scrollRoom, setScrollRoom] = useState(0);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const header = headerRef.current;
    const track = trackRef.current;
    if (!header || !track) return;

    /** 页面滚多少，卡片就往上移多少：卡片区钉在页头下沿、自己裁住滚出去的部分，
        于是只有卡片在动，滚动条是窗口自己那根 —— 卡片区里不会有第二条。 */
    const move = (): void => {
      track.style.transform = `translateY(-${window.scrollY}px)`;
    };

    /** 页头一改高度（换行、字号、档位多少）就重新量：卡片区长度与全局滚动条长度都跟着变。 */
    const measure = (): void => {
      const pinned = header.getBoundingClientRect().height;
      const visible = window.innerHeight - pinned;
      setPinnedHeight(pinned);
      setScrollRoom(Math.max(0, track.getBoundingClientRect().height - visible));
      move();
    };

    measure();
    window.addEventListener('scroll', move, { passive: true });
    window.addEventListener('resize', measure);
    /* 页头高度与卡片总高都随内容 / 视口变，交给 ResizeObserver 盯着（jsdom 里没有它，测试环境退回 resize）。 */
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(header);
    observer?.observe(track);
    return () => {
      window.removeEventListener('scroll', move);
      window.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  }, []);

  const error = gamesQuery.error ?? themesQuery.error;

  return (
    <div className="relative min-h-screen bg-background">
      <PetalField />
      <div className="relative mx-auto w-full max-w-7xl px-3 sm:px-6">
        {/* 页头不盖色：纸和落花直接从字后面透过来。它钉在顶上，卡片区从它下沿才开始，
            所以没有卡片会从字底下穿过 —— 不必再拿一块糊掉花瓣的毛玻璃去遮。 */}
        <div
          ref={headerRef}
          className="pinned-header pb-5 pt-5 sm:pb-6 sm:pt-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-4">
            <div className="space-y-1">
              <BrandLogo
                height={22}
                withWordmark
                /* 窄屏收小一档：这一页的主题名在手机上要当主角，字标压成配角。 */
                className="flex shrink-0 items-center gap-2 max-sm:[--brand-size:22px] max-sm:[--brand-wordmark-size:14px]"
              />
              {loading ? (
                <p className="text-[11px] text-muted-foreground sm:text-xs">
                  <InlineLoading caption="正在加载游戏…" />
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {/* 透明按钮（ghost）不加玻璃框：它本来就没有底色，罩一层只会多出一个没内容的框。 */}
              <ThemeToggle className="h-9 w-9" />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="liquid-glass gap-1.5 text-xs sm:text-sm"
                /* 进工坊落到**概览**，不是地图。 每个工作空间有自己的首页（`/:code/overview`），导航第一项也是它。 概览本来就是回答「这个空间是什么、有什么」的那一页，从外面进来先看 它，比先看一张画布合理。 带上主题编码 —— 从 A 主题的列表页进工坊，该落到 A 的概览， 而不是「上一次待过的那个主题」。 */
                onClick={() => navigate(workshopPath('overview', code))}
                title="进入工坊（制作端）"
              >
                进入工坊
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/*
           * 主题这一层信息 —— 名字、一句话介绍、两行计数。
           * 与播放器里那页同一个次序：先回答「这是哪个世界」，再回答「有多少关」。
           */}
          <div className="mt-4 space-y-2 sm:mt-8">
            <h1 className="font-serif text-2xl font-semibold tracking-tight sm:text-3xl">
              {theme?.name ?? '游戏'}
            </h1>
            {theme?.description ? (
              <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground sm:text-sm">
                {theme.description}
              </p>
            ) : null}
            {loading ? null : (
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground sm:text-xs">
                <span>{formatGameListCount(texts.playable, allGames.length)}</span>
                {completions.size > 0 ? (
                  <>
                    <span aria-hidden className="text-border">
                      ·
                    </span>
                    <span data-testid="games-passed-count">
                      {formatGameListCount(texts.passed, completions.size)}
                    </span>
                  </>
                ) : null}
              </p>
            )}
          </div>

          {loading || error || allGames.length === 0 ? null : (
            <div className="mt-5 sm:mt-6">
              <DifficultyFilter tiers={tiers} value={difficulty} onChange={setDifficulty} />
            </div>
          )}
        </div>

        {/*
         * 卡片区钉在页头下沿、自己裁住滚出去的部分：它没有滚动条，页面也没有第二条 ——
         * 位移跟着窗口的 `scrollY` 走（见上面那个 effect），所以看得见的那根是全局的，
         * 鼠标停在哪都能滚。
         */}
        <div
          className="cards-viewport"
          style={{ top: pinnedHeight, height: `calc(100dvh - ${pinnedHeight}px)` }}
        >
          <div ref={trackRef} className="cards-track space-y-5 pb-12 sm:space-y-8">
            {loading ? (
              <div className="grid grid-cols-2 gap-2 sm:gap-5 md:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="aspect-square w-full" />
                ))}
              </div>
            ) : error ? (
              <Card className="liquid-glass flex flex-col items-center gap-3 p-8 text-center sm:p-12">
                <p className="text-xs text-muted-foreground sm:text-sm">
                  {error instanceof Error ? error.message : '加载失败'}
                </p>
                <Button
                  variant="outline"
                  className="liquid-glass"
                  onClick={() => void gamesQuery.refetch()}
                >
                  重试
                </Button>
              </Card>
            ) : allGames.length === 0 ? (
              <Card className="liquid-glass mx-auto flex max-w-md flex-col items-center gap-4 p-8 text-center sm:p-12">
                <Gamepad2 className="h-10 w-10 text-muted-foreground/60" />
                <CardContent className="space-y-1 p-0">
                  <p className="font-medium">这个主题还没有部署任何游戏</p>
                  <p className="text-xs text-muted-foreground sm:text-sm">
                    去谜题列表把谜题部署为游戏，就能在这里开始游玩。
                  </p>
                </CardContent>
                <Button asChild variant="outline" className="liquid-glass">
                  <Link to={workshopPath('puzzles', code)}>前往谜题列表</Link>
                </Button>
              </Card>
            ) : games.length === 0 ? (
              /* 过滤之后空了 —— 与「这个主题一关都没有」是两件事：前者换个档就有， 后者要去工坊。混成一句会把人送去错误的地方。这一档不摆卡：框和底色是给有内容的卡片的，空档留白说话。 */
              <div className="flex flex-col items-center gap-3 py-12 text-center sm:py-16">
                <p className="font-serif text-base tracking-tight text-muted-foreground sm:text-lg">空白纸，未落笔。</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="liquid-glass"
                  onClick={() => setDifficulty(null)}
                >
                  看全部
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:gap-5 md:grid-cols-3 xl:grid-cols-4">
                {games.map((game) => (
                  <GameCard
                    key={game.id}
                    game={game}
                    /* 卡片的落点也带主题段 —— 与列表页同一个世界。 */
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

        <div aria-hidden style={{ height: scrollRoom }} />
      </div>
    </div>
  );
}
