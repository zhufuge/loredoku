import Router from '@koa/router';
import { API_PREFIX } from '@loredoku/shared';
import { healthRouter } from './health';
import { projectsRouter } from './projects';
import { itemsRouter } from './items';
import { charactersRouter } from './characters';
import { puzzlesRouter } from './puzzles';
import { gamesRouter } from './games';

export const apiRouter = new Router({ prefix: API_PREFIX });

apiRouter.use(healthRouter.routes(), healthRouter.allowedMethods());
apiRouter.use('/projects', projectsRouter.routes(), projectsRouter.allowedMethods());
apiRouter.use('/items', itemsRouter.routes(), itemsRouter.allowedMethods());
apiRouter.use('/characters', charactersRouter.routes(), charactersRouter.allowedMethods());
// v0.5.0 FEAT-K01: the puzzle module. It replaced the flat `/api/versions`
// listing (the old works table) — the table's data source is `/api/puzzles`.
apiRouter.use('/puzzles', puzzlesRouter.routes(), puzzlesRouter.allowedMethods());
// FEAT-G02: cross-map deployed games listing for the games home page.
apiRouter.use('/games', gamesRouter.routes(), gamesRouter.allowedMethods());

// Legacy v0.1 route: /api/cards -> /api/items (permanent redirect).
apiRouter.redirect('/cards', `${API_PREFIX}/items`, 308);
apiRouter.redirect('/cards/:path*', `${API_PREFIX}/items/:path*`, 308);
