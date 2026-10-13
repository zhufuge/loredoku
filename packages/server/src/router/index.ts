import Router from '@koa/router';
import { API_PREFIX } from '@murdoku/shared';
import { healthRouter } from './health';

export const apiRouter = new Router({ prefix: API_PREFIX });

apiRouter.use(healthRouter.routes(), healthRouter.allowedMethods());
