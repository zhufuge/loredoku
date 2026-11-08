import { Navigate, createBrowserRouter } from 'react-router-dom';
import { BUNDLE_CODE, playerBasename } from './bundleCode';
import { PlayerGamePage } from './PlayerGamePage';
import { PlayerHomePage } from './PlayerHomePage';

/**
 * v0.9.0（docs/v0.9.0.md §3）—— 播放器只有两条路由。
 *
 * ```
 * /:code/play            关卡列表
 * /:code/play/:key       一关
 * ```
 *
 * `basename` 是站点 base（`/loredoku`）：浏览器里看到的是
 * `/loredoku/hlm/play`，而代码里写的是 `/hlm/play`。这样换部署路径只改
 * `vite.player.config.ts` 一处，路由与页面里的地址都不用动。
 *
 * 根地址直接跳到**构建时烤进去的那个主题** —— 一个产物只装一个包，`/loredoku/`
 * 没有第二个合理去处。`BUNDLE_CODE` 为空（有人绕过构建直接跑 vite）时退回
 * 列表页，让页面自己报「没有这个包」。
 */
export const playerRouter = createBrowserRouter(
  [
    {
      path: '/',
      element: <Navigate to={BUNDLE_CODE ? `/${BUNDLE_CODE}/play` : '/play'} replace />,
    },
    { path: '/:code/play', element: <PlayerHomePage /> },
    { path: '/:code/play/:key', element: <PlayerGamePage /> },
    {
      path: '*',
      element: <Navigate to={BUNDLE_CODE ? `/${BUNDLE_CODE}/play` : '/play'} replace />,
    },
  ],
  { basename: playerBasename() },
);
