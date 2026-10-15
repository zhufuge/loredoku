import Router from '@koa/router';
import { API_PREFIX } from '@murdoku/shared';
import { healthRouter } from './health';
import { projectsRouter } from './projects';
import { itemsRouter } from './items';
import { charactersRouter } from './characters';
import { versionsRouter } from './versions';

export const apiRouter = new Router({ prefix: API_PREFIX });

apiRouter.use(healthRouter.routes(), healthRouter.allowedMethods());
apiRouter.use('/projects', projectsRouter.routes(), projectsRouter.allowedMethods());
apiRouter.use('/items', itemsRouter.routes(), itemsRouter.allowedMethods());
apiRouter.use('/characters', charactersRouter.routes(), charactersRouter.allowedMethods());
// OPT-905: cross-map works listing for the works table.
apiRouter.use('/versions', versionsRouter.routes(), versionsRouter.allowedMethods());

// Legacy v0.1 route: /api/cards -> /api/items (permanent redirect).
apiRouter.redirect('/cards', `${API_PREFIX}/items`, 308);
apiRouter.redirect('/cards/:path*', `${API_PREFIX}/items/:path*`, 308);
