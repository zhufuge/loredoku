import Router from '@koa/router';
import { API_PREFIX } from '@murdoku/shared';
import { healthRouter } from './health';
import { projectsRouter } from './projects';
import { cardsRouter } from './cards';
import { regionsRouter } from './regions';

export const apiRouter = new Router({ prefix: API_PREFIX });

apiRouter.use(healthRouter.routes(), healthRouter.allowedMethods());
apiRouter.use('/projects', projectsRouter.routes(), projectsRouter.allowedMethods());
apiRouter.use('/cards', cardsRouter.routes(), cardsRouter.allowedMethods());
apiRouter.use('/regions', regionsRouter.routes(), regionsRouter.allowedMethods());
