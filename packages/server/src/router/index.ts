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
// FEAT-K01: the puzzle module. Its data source is `/api/puzzles`.
apiRouter.use('/puzzles', puzzlesRouter.routes(), puzzlesRouter.allowedMethods());
// FEAT-G02: cross-map deployed games listing for the games home page.
apiRouter.use('/games', gamesRouter.routes(), gamesRouter.allowedMethods());
// 主题（边界与缺省风格）。上线一关就是 `/api/puzzles/:id/games`。
apiRouter.use('/themes', themesRouter.routes(), themesRouter.allowedMethods());

// 地图模块的接口前缀是 /api/maps。`/api/projects` 是已消失的 projects 表留下的
// 旧前缀，前端不再调用；重定向只为手边还存着旧 URL 的场景。
redirectLegacyPrefix('/projects', '/maps');

// Legacy v0.1 route: /api/cards -> /api/assets (permanent redirect).
redirectLegacyPrefix('/cards', '/assets');
// /api/items -> /api/assets (permanent redirect).
redirectLegacyPrefix('/items', '/assets');

/** 旧前缀永久重定向，余路径与查询串原样带过去。
 *  不用 `router.redirect()`（不展开 `:path*` 参数），旧前缀无路由故注册成 `all`；`from`/`to` 不含 `API_PREFIX`，避免拼成 `/api/api/...`。 */
function redirectLegacyPrefix(from: string, to: string): void {
  const legacy = `${API_PREFIX}${from}`;
  const handler = (ctx: Context): void => {
    ctx.status = 308;
    ctx.set('Location', `${API_PREFIX}${to}${ctx.url.slice(legacy.length)}`);
  };
  apiRouter.all(from, handler);
  apiRouter.all(`${from}/:path*`, handler);
}
