import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { GameListShell } from '@/components/game/GameListShell';
import { GameCard } from '@/components/game/GameCard';
import { useGames } from '@/hooks/useGames';
import { useImagePreload } from '@/hooks/useImagePreload';
import { useThemes } from '@/hooks/useThemes';
import { resolveDifficultyTiers, resolveGameListTexts } from '@loredoku/shared';
import { readGameCompletion, type GameCompletion } from '@/lib/gameCompletion';
import { readLastLeftAt, readLastLeftElapsed } from '@/lib/gameTimer';
import { gameCoverUrls } from '@/lib/pageImages';
import { workshopPath } from '@/lib/workspace';

/** 这一页是**一个主题一张表**（`/:code/play`，docs/v0.8.0.md §10 / §16.5），与播放器里那页同一副骨架（`GameListShell`）—— 同一批关卡在两个入口里长得一样，玩家不必猜「线上那版和工坊这版是不是同一个东西」。地址里的编码就是筛选条件，于是：主题名成了标题，难度分级只列**这个主题**那几档，工坊的门也落在这个主题上。 */
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

  return (
    <GameListShell
      themeName={theme?.name ?? null}
      description={theme?.description ?? null}
      titleFontFamily={theme?.data.fontFamily ?? null}
      texts={texts}
      allCount={allGames.length}
      passedCount={completions.size}
      tiers={tiers}
      difficulty={difficulty}
      onDifficultyChange={setDifficulty}
      games={games}
      loading={loading}
      loadingCaption="正在加载游戏…"
      error={gamesQuery.error ?? themesQuery.error ?? undefined}
      onRetry={() => void gamesQuery.refetch()}
      onWorkshop={() => navigate(workshopPath('overview', code))}
      puzzlesHref={workshopPath('puzzles', code)}
      renderGame={(game) => (
        <GameCard
          game={game}
          /* 卡片的落点也带主题段 —— 与列表页同一个世界。 */
          href={code ? `/${code}/play/${game.slug}` : `/play/${game.slug}`}
          tiers={tiers}
          completion={completions.get(game.slug) ?? null}
          lastLeftAt={lastLeft.get(game.slug)?.at ?? null}
          lastLeftElapsedMs={lastLeft.get(game.slug)?.elapsedMs ?? null}
        />
      )}
    />
  );
}
