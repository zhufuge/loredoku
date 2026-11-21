import { Navigate, createBrowserRouter } from 'react-router-dom';
import { BUNDLE_CODE, playerBasename } from './bundleCode';
import { themeHrefOf } from './bundleLoad';
import { PlayerGamePage } from './PlayerGamePage';
import { PlayerHomePage } from './PlayerHomePage';

/** v0.9.0（docs/v0.9.0.md §3）—— 播放器只有两条路由。 ``` /:code/play 关卡列表 /:code/play/:key 一关 ``` `basename` 是站点 base（`/loredoku`）：浏览器里看到的是 `/loredoku/hlm/play`，而代码里写的是 `/hlm/play`。 这样换部署路径只改 `vite.player.config.ts` 一处，路由与页面里的地址都不用动。 跳转目标用 `themeHrefOf()` 而不是手拼 `/code/play`：那里带着结尾斜杠 （v0.11.1 起每个路由都是产物里的一份真目录），手拼一份迟早会漏。 */
const listHref = BUNDLE_CODE ? themeHrefOf(BUNDLE_CODE) : '/play';

export const playerRouter = createBrowserRouter(
  [
    { path: '/', element: <Navigate to={listHref} replace /> },
    { path: '/:code/play', element: <PlayerHomePage /> },
    { path: '/:code/play/:key', element: <PlayerGamePage /> },
    { path: '*', element: <Navigate to={listHref} replace /> },
  ],
  { basename: playerBasename() },
);
