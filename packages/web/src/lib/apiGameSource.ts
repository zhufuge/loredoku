import { useMemo } from 'react';
import { fileUrlFromPath } from '@loredoku/shared';
import { useAssets } from '@/hooks/useAssets';
import { useCharacters } from '@/hooks/useCharacters';
import { useGameDetail, useGames } from '@/hooks/useGames';
import {
  useCheckColorsByCode,
  useMarkByCode,
  useRingByCode,
  useToolIconsByCode,
} from '@/hooks/useThemes';
import type { GameLevelRef } from '@/lib/gameCatalog';
import type { GameSource } from '@/lib/gameSource';

/**
 * v0.9.0（docs/v0.9.0.md §2）—— **接口模式**的那一份 `GameSource`：四个 query
 * 各自委托给原来的 hook，一行逻辑都不新写。
 *
 * 为什么单独一个文件：这些 hook 一路 import 到 `@/api/*` → `axios`，而模块的
 * 顶层 import 是**执行即生效**的 —— `gameSource.tsx` 里只要还留着这个函数，
 * 播放器一旦 import 那个 context，axios 就跟着进产物（实测：`vendor-ui` 里能
 * 搜到 `axios/` 的 UA 字符串）。拆开之后 `gameSource.tsx` 只剩「接口 + context」，
 * 播放器引它是零依赖。
 *
 * 两个主题级兜底（标记 / 工具图标）用 `useCallback` 保住引用稳定 —— 它们进了
 * `useMemo` 的依赖数组，每次渲染换一个函数就会让画布白重算一遍。
 */
export function useApiGameSource(): GameSource {
  const markOf = useMarkByCode();
  const toolIconsOf = useToolIconsByCode();
  const ringOf = useRingByCode();
  const checkColorsOf = useCheckColorsByCode();

  return useMemo<GameSource>(
    () => ({
      kind: 'api',
      useGame(key) {
        const query = useGameDetail(key);
        return {
          data: query.data ?? null,
          isLoading: query.isLoading,
          isError: query.isError,
        };
      },
      useAssets() {
        const query = useAssets({});
        return {
          data: query.data ?? null,
          isLoading: query.isLoading,
          isError: query.isError,
        };
      },
      useCharacters() {
        const query = useCharacters({});
        return {
          data: query.data ?? null,
          isLoading: query.isLoading,
          isError: query.isError,
        };
      },
      fileUrl: (path) => fileUrlFromPath(path),
      themeMark: (themeCode) => markOf(themeCode),
      themeToolIcons: (themeCode) => toolIconsOf(themeCode),
      themeRing: (themeCode) => ringOf(themeCode),
      themeCheckColors: (themeCode) => checkColorsOf(themeCode),
      storageId: (key) => key,
      listHref: () => '/play',
      gameHref: (key) => `/play/${key}`,
      /**
       * v0.9.5：定案卡的「下一关」要知道整份清单。这里读的就是列表页那一份
       * `/api/games`（同一个 `gameKeys.all`，react-query 去重，不会多一个请求），
       * 顺序也沿用它返回的 `sortWeight, slug` —— 卡片网格排成什么样，「下一关」
       * 就按什么走。
       */
      useCatalog() {
        const query = useGames();
        const data = useMemo<GameLevelRef[] | null>(
          () =>
            query.data
              ? query.data.map((game) => ({ key: game.slug, gridSize: game.gridSize }))
              : null,
          [query.data],
        );
        return { data, isLoading: query.isLoading, isError: query.isError };
      },
    }),
    [markOf, toolIconsOf, ringOf, checkColorsOf],
  );
}
