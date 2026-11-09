import Router from '@koa/router';
import type { Context } from 'koa';
import { API_PREFIX } from '@loredoku/shared';
import { healthRouter } from './health';
import { mapsRouter } from './maps';
import { assetsRouter } from './assets';
import { charactersRouter } from './characters';
import { puzzlesRouter } from './puzzles';
import { gamesRouter } from './games';
import { themesRouter } from './themes';

export const apiRouter = new Router({ prefix: API_PREFIX });

apiRouter.use(healthRouter.routes(), healthRouter.allowedMethods());
apiRouter.use('/maps', mapsRouter.routes(), mapsRouter.allowedMethods());
apiRouter.use('/assets', assetsRouter.routes(), assetsRouter.allowedMethods());
apiRouter.use('/characters', charactersRouter.routes(), charactersRouter.allowedMethods());
// v0.5.0 FEAT-K01: the puzzle module. It replaced the flat `/api/versions`
// listing (the old works table) — the table's data source is `/api/puzzles`.
apiRouter.use('/puzzles', puzzlesRouter.routes(), puzzlesRouter.allowedMethods());
// FEAT-G02: cross-map deployed games listing for the games home page.
apiRouter.use('/games', gamesRouter.routes(), gamesRouter.allowedMethods());
// v0.8.0: 主题（边界与缺省风格）。v0.9.2 起没有 `/theme-deployments` —— 合辑
// 连同它的两张表一起删了，上线一关就是 `/api/puzzles/:id/games`。
apiRouter.use('/themes', themesRouter.routes(), themesRouter.allowedMethods());

// 地图模块的接口前缀是 /api/maps。`/api/projects` 是已消失的 projects 表留下的
// 旧前缀，前端不再调用；重定向只为手边还存着旧 URL 的场景。
redirectLegacyPrefix('/projects', '/maps');

// Legacy v0.1 route: /api/cards -> /api/assets (permanent redirect).
redirectLegacyPrefix('/cards', '/assets');
// v0.6.0: /api/items -> /api/assets (permanent redirect).
redirectLegacyPrefix('/items', '/assets');

/**
 * 旧前缀的永久重定向，余下路径与查询串原样带过去。
 *
 * 不用 `router.redirect()`：它把目标里的 `:path*` 原样写进 `Location`（不展开参数），
 * 子路径会跳到字面量 `/api/maps/:path*`。而 `router.use()` 挂的中间件只在某条路由
 * 命中时才会执行 —— 旧前缀没有任何路由，所以这里注册成 `all` 路由。
 *
 * `from` / `to` 不含 `API_PREFIX`：`router.all()` 会自己加前缀，重复拼会得到
 * `/api/api/projects`。
 */
function redirectLegacyPrefix(from: string, to: string): void {
  const legacy = `${API_PREFIX}${from}`;
  const handler = (ctx: Context): void => {
    ctx.status = 308;
    ctx.set('Location', `${API_PREFIX}${to}${ctx.url.slice(legacy.length)}`);
  };
  apiRouter.all(from, handler);
  apiRouter.all(`${from}/:path*`, handler);
}
