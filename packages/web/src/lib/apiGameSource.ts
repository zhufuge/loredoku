import { useMemo } from 'react';
import { fileUrlFromPath } from '@loredoku/shared';
import { useAssets } from '@/hooks/useAssets';
import { useCharacters } from '@/hooks/useCharacters';
import { useGameDetail } from '@/hooks/useGames';
import {
  useCheckStyleByCode,
  useForbiddenSymbolByCode,
  usePressRingByCode,
  useToolIconsByCode,
} from '@/hooks/useThemes';
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
 * 两个主题级兜底（禁止符号 / 工具图标）用 `useCallback` 保住引用稳定 —— 它们进了
 * `useMemo` 的依赖数组，每次渲染换一个函数就会让画布白重算一遍。
 */
export function useApiGameSource(): GameSource {
  const forbiddenSymbolOf = useForbiddenSymbolByCode();
  const toolIconsOf = useToolIconsByCode();
  const pressRingOf = usePressRingByCode();
  const checkStyleOf = useCheckStyleByCode();

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
      themeForbiddenSymbol: (themeCode) => forbiddenSymbolOf(themeCode),
      themeToolIcons: (themeCode) => toolIconsOf(themeCode),
      themePressRing: (themeCode) => pressRingOf(themeCode),
      themeCheckStyle: (themeCode) => checkStyleOf(themeCode),
      storageId: (key) => key,
      listHref: () => '/play',
      gameHref: (key) => `/play/${key}`,
    }),
    [forbiddenSymbolOf, toolIconsOf, pressRingOf, checkStyleOf],
  );
}
