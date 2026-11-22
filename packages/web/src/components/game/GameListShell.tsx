import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Gamepad2 } from 'lucide-react';
import {
  fontFamilyStack,
  formatGameListCount,
  type GameListTexts,
  type ThemeDifficultyTier,
} from '@loredoku/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { LoadingScreen } from '@/components/common/LoredokuLoader';
import { PetalField } from '@/components/common/PetalField';
import { DifficultyFilter } from '@/components/game/DifficultyFilter';
import { BrandLogo } from '@/components/layout/BrandLogo';
import { ThemeToggle } from '@/components/layout/ThemeToggle';

/**
 * 关卡列表页的骨架（v0.11.10）。工坊的 `/:code/play` 与播放器的 `/loredoku/:code/play` 长的是同一张脸：
 * 落花背景、钉住的页头、只滚卡片区（滚动条是窗口那根）、主题字体写标题。两个入口的差别只在数据从哪来、
 * 有没有「进入工坊」的出口 —— 那两件事由 props 说，其余都在这一个文件里，改一处两边一起变。
 *
 * 「只滚卡片区」的做法：卡片区钉在页头下沿、`overflow: hidden` 裁住滚出去的部分，位移跟着
 * `window.scrollY` 走；页面末尾补一段与「卡片总高 − 可见高」等高的空白，让全局滚动条够长。
 * 用一个只监听窗口滚动的位移，而不是让卡片区自己 `overflow-y: auto` —— 后者会多出一条内滚动条，
 * 而且滚轮得先把指针挪进卡片区才生效。
 */
export interface GameListShellProps<G extends { slug: string; difficulty: number }> {
  /** 主题名，写进 `<h1>` 与 doc title。 */
  themeName: string | null;
  description?: string | null;
  /** 标题字体：与地图区域标签同一套名字，缺席 = 页面自己的衬线。 */
  titleFontFamily?: string | null;
  texts: GameListTexts;
  /** 这个主题一共几关（含所有档）；「N 关可玩」用**全部**，切档不该让数字变小。 */
  allCount: number;
  passedCount: number;
  tiers?: readonly ThemeDifficultyTier[];
  difficulty: number | null;
  onDifficultyChange: (next: number | null) => void;
  /** 当前这一档要画的卡；卡片长什么样由调用方给（两边的落点与存档键不同）。 */
  games: G[];
  renderGame: (game: G) => ReactNode;
  loading: boolean;
  /** 整页加载时的那句话。 */
  loadingCaption: string;
  error?: unknown;
  onRetry?: () => void;
  /** 有了才画「进入工坊」—— 播放器里没有工坊可进。 */
  onWorkshop?: () => void;
  /** 出错的卡里画什么；不给就画错误信息 + 「重试」。 */
  errorContent?: ReactNode;
  /** 一关都没有时的卡里画什么；不给就画「去谜题列表部署」那一套。 */
  emptyContent?: ReactNode;
  /** 默认空态卡里「前往谜题列表」的去处；给了才画那颗按钮。 */
  puzzlesHref?: string;
  /** 页头下、卡片区上的一行提示（例如包和目录对不上）。 */
  banner?: ReactNode;
}

export function GameListShell<G extends { slug: string; difficulty: number }>({
  themeName,
  description,
  titleFontFamily,
  texts,
  allCount,
  passedCount,
  tiers,
  difficulty,
  onDifficultyChange,
  games,
  renderGame,
  loading,
  loadingCaption,
  error,
  onRetry,
  onWorkshop,
  errorContent,
  emptyContent,
  puzzlesHref,
  banner,
}: GameListShellProps<G>): JSX.Element {
  /** 页头有多高，卡片区就钉在它下沿。 */
  const [pinnedHeight, setPinnedHeight] = useState(0);
  /** 卡片比一屏多出来的高度，补给页面 —— 全局滚动条才够长。 */
  const [scrollRoom, setScrollRoom] = useState(0);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    /* 加载中整页只有加载件，页头还没挂上 —— 等它画出来再量。 */
    if (loading) return;
    const header = headerRef.current;
    const track = trackRef.current;
    if (!header || !track) return;

    /** 页面滚多少，卡片就往上移多少。 */
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
  }, [loading]);

  /** 数据齐了才画页头 —— 主题名先出来再换字形，就是要消灭的那一帧。 */
  if (loading) return <LoadingScreen caption={loadingCaption} />;

  const hasGames = allCount > 0;

  return (
    <div className="relative min-h-dvh bg-background">
      <PetalField />
      <div className="relative mx-auto w-full max-w-7xl px-3 sm:px-6">
        {/* 页头不盖色：纸和落花直接从字后面透过来。它钉在顶上，卡片区从它下沿才开始，
            所以没有卡片会从字底下穿过 —— 不必再拿一块糊掉花瓣的毛玻璃去遮。 */}
        <div ref={headerRef} className="pinned-header pb-5 pt-5 sm:pb-6 sm:pt-6">
          <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-4">
            <div className="space-y-1">
              <BrandLogo
                height={22}
                withWordmark
                /* 窄屏收小一档：这一页的主题名在手机上要当主角，字标压成配角。 */
                className="flex shrink-0 items-center gap-2 max-sm:[--brand-size:22px] max-sm:[--brand-wordmark-size:14px]"
              />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {/* 透明按钮（ghost）不加玻璃框：它本来就没有底色，罩一层只会多出一个没内容的框。 */}
              <ThemeToggle className="h-9 w-9" />
              {onWorkshop ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="liquid-glass gap-1.5 text-xs sm:text-sm"
                  /* 进工坊落到**概览**，不是地图：概览本来就回答「这个空间是什么、有什么」。
                     带上主题编码 —— 从 A 主题的列表页进工坊，该落到 A 的概览。 */
                  onClick={onWorkshop}
                  title="进入工坊（制作端）"
                >
                  进入工坊
                  <ArrowRight className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          </div>

          {/*
           * 主题这一层信息 —— 名字、一句话介绍、两行计数。
           * 先回答「这是哪个世界」，再回答「有多少关」。
           */}
          <div className="mt-4 space-y-2 sm:mt-8">
            <h1
              className="truncate text-2xl font-semibold tracking-tight sm:text-3xl"
              style={{ fontFamily: fontFamilyStack(titleFontFamily ?? 'serif') }}
            >
              {themeName ?? '游戏'}
            </h1>
            {description ? (
              <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground sm:text-sm">
                {description}
              </p>
            ) : null}
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground sm:text-xs">
              <span>{formatGameListCount(texts.playable, allCount)}</span>
              {/* 一题没解就不提「已通过」：那一刻这个数字只会让人以为自己漏了什么。 */}
              {passedCount > 0 ? (
                <>
                  <span aria-hidden className="text-border">
                    ·
                  </span>
                  <span data-testid="games-passed-count">
                    {formatGameListCount(texts.passed, passedCount)}
                  </span>
                </>
              ) : null}
            </p>
          </div>

          {error || !hasGames ? null : (
            <div className="mt-5 sm:mt-6">
              <DifficultyFilter tiers={tiers ?? []} value={difficulty} onChange={onDifficultyChange} />
            </div>
          )}
        </div>

        {banner}

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
            {error ? (
              <Card className="liquid-glass flex flex-col items-center gap-3 p-8 text-center sm:p-12">
                {errorContent ?? (
                  <>
                    <p className="text-xs text-muted-foreground sm:text-sm">
                      {error instanceof Error ? error.message : '加载失败'}
                    </p>
                    {onRetry ? (
                      <Button variant="outline" className="liquid-glass" onClick={onRetry}>
                        重试
                      </Button>
                    ) : null}
                  </>
                )}
              </Card>
            ) : !hasGames ? (
              <Card className="liquid-glass mx-auto flex max-w-md flex-col items-center gap-4 p-8 text-center sm:p-12">
                {emptyContent ?? (
                  <>
                    <Gamepad2 className="h-10 w-10 text-muted-foreground/60" />
                    <CardContent className="space-y-1 p-0">
                      <p className="font-medium">这个主题还没有部署任何游戏</p>
                      <p className="text-xs text-muted-foreground sm:text-sm">
                        去谜题列表把谜题部署为游戏，就能在这里开始游玩。
                      </p>
                    </CardContent>
                    {puzzlesHref ? (
                      <Button asChild variant="outline" className="liquid-glass">
                        <Link to={puzzlesHref}>前往谜题列表</Link>
                      </Button>
                    ) : null}
                  </>
                )}
              </Card>
            ) : games.length === 0 ? (
              /* 过滤之后空了 —— 与「这个主题一关都没有」是两件事：前者换个档就有，
                 后者要去工坊。混成一句会把人送去错误的地方。这一档不摆卡：框和底色
                 是给有内容的卡片的，空档留白说话。 */
              <div className="flex flex-col items-center gap-3 py-12 text-center sm:py-16">
                <p className="font-serif text-base tracking-tight text-muted-foreground sm:text-lg">
                  空白纸，未落笔。
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="liquid-glass"
                  onClick={() => onDifficultyChange(null)}
                >
                  看全部
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:gap-5 md:grid-cols-3 xl:grid-cols-4">
                {games.map((game) => (
                  <Fragment key={game.slug}>{renderGame(game)}</Fragment>
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
