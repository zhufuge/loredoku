import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { GameSource } from '@/lib/gameSource';
import {
  bundleFileUrl,
  bundleRoot,
  bundleStorageId,
  gameHrefOf,
  loadAssets,
  loadCharacters,
  loadGame,
  loadManifest,
  themeHrefOf,
} from './bundleLoad';

/**
 * 包的身份 —— 列表页与关卡页都要它，所以提出来当一个共享 query。
 *
 * `queryKey` 按编码分，两个页面同时挂载时只会发一次请求（react-query 去重）。
 * `retry: false`：包缺失是**配置错误**（路径给错、忘了 `--bundle`），重试三次只会
 * 让一句本该立刻出现的提示晚到两秒。
 */
export function useBundleManifest(code: string) {
  const root = useMemo(() => bundleRoot(code), [code]);
  const query = useQuery({
    queryKey: ['bundle', code, 'manifest'],
    queryFn: () => loadManifest(root),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  return { root, ...query };
}

/**
 * v0.9.0（docs/v0.9.0.md §5）—— 播放器那一份 `GameSource`：数据全部来自一个
 * 静态资源包，一个 `/api` 都不发。
 *
 * 四个 query 的 `staleTime` 都是 `Infinity`：包是**构建时烤进产物**的，一个会话里
 * 它一个字节都不会变。这意味着「进第二关不再重新取 assets」「返回列表再进同一关
 * 是瞬开」—— 也意味着开发时要刷新页面才能看到新包（dev 的包来自磁盘，改完要重启
 * vite，见 `scripts/bundleAssets.mjs`）。
 */
export function useBundleGameSource(code: string): GameSource {
  const { root, ...manifestQuery } = useBundleManifest(code);
  const manifest = manifestQuery.data ?? null;

  const assetsQuery = useQuery({
    queryKey: ['bundle', code, 'assets'],
    queryFn: () => loadAssets(root, manifest!),
    enabled: manifest !== null,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });

  const charactersQuery = useQuery({
    queryKey: ['bundle', code, 'characters'],
    queryFn: () => loadCharacters(root, manifest!),
    enabled: manifest !== null,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });

  return useMemo<GameSource>(
    () => ({
      kind: 'bundle',
      /**
       * 主题名来自 `manifest.theme` —— 不需要按编码再查一次（包自己就是那个主题）。
       * `_ref` 收下但不用：播放器的路由里那段 `:code` 是**包的位置**，不是查询条件。
       */
      useGame(key) {
        const query = useQuery({
          queryKey: ['bundle', code, 'game', key ?? ''],
          queryFn: () => loadGame(root, manifest!, key!),
          enabled: manifest !== null && Boolean(key),
          staleTime: Number.POSITIVE_INFINITY,
          retry: false,
        });
        return {
          data: query.data ?? null,
          // `enabled: false` 时 `isPending` 也是 true，所以和 manifest 那道门合起来判。
          isLoading: manifestQuery.isLoading || query.isPending,
          isError: manifestQuery.isError || query.isError,
        };
      },
      useAssets() {
        return {
          data: assetsQuery.data ?? null,
          isLoading: manifestQuery.isLoading || assetsQuery.isPending,
          isError: manifestQuery.isError || assetsQuery.isError,
        };
      },
      useCharacters() {
        return {
          data: charactersQuery.data ?? null,
          isLoading: manifestQuery.isLoading || charactersQuery.isPending,
          isError: manifestQuery.isError || charactersQuery.isError,
        };
      },
      fileUrl: (path) => bundleFileUrl(root, path) ?? '',
      /**
       * 包里**每一关已经带好了**最终解析结果：`bundleService` 在打包时就把
       * 「谜题没配 → 主题那张」补进了关卡 JSON（v0.8.7 §4 / §7）。所以这里恒为
       * `null`，游戏页的两条兜底分支在播放器里永远不会走到。
       */
      themeForbiddenSymbol: () => null,
      themeToolIcons: () => null,
      /**
       * v0.9.2 §2：计时环那张图**不逐关**内联 —— 全主题共用一张，装在
       * `manifest.theme.pressRing` 里，`path` 是包内相对路径（`files/ring/...`）。
       * 游戏页拿它过 `fileUrl` 拼包根，与其它包内图片同一条路。
       */
      themePressRing: () => manifest?.theme.pressRing ?? null,
      /**
       * v0.9.3 §3：校验样式同样只在 manifest 里一份（两档颜色是几个字节，圈图是
       * `files/check/...`）。老包没有这个键 → `null`，游戏页落回内置绿 / 红。
       */
      themeCheckStyle: () => manifest?.theme.checkStyle ?? null,
      storageId: (key) => bundleStorageId(code, key),
      listHref: () => themeHrefOf(code),
      gameHref: (key) => gameHrefOf(code, key),
    }),
    [
      code,
      root,
      manifest,
      manifestQuery.isLoading,
      manifestQuery.isError,
      assetsQuery.data,
      assetsQuery.isPending,
      assetsQuery.isError,
      charactersQuery.data,
      charactersQuery.isPending,
      charactersQuery.isError,
    ],
  );
}
