import Koa from 'koa';
import cors from 'koa2-cors';
import logger from 'koa-logger';
import { koaBody } from 'koa-body';
import mount from 'koa-mount';
import serve from 'koa-static';
import { FILES_ROUTE_PREFIX } from '@murdoku/shared';
import { errorHandler } from './middleware/errorHandler';
import { notFoundHandler } from './middleware/notFound';
import { apiRouter } from './router';
import { uploadRoot } from './utils/paths';

export function createApp(): Koa {
  const app = new Koa();
  app.proxy = true;

  app.use(errorHandler);
  app.use(logger());
  app.use(cors());
  app.use(
    koaBody({
      multipart: false,
      json: true,
      urlencoded: true,
      jsonLimit: '8mb',
      textLimit: '8mb',
    }),
  );

  app.use(
    mount(
      FILES_ROUTE_PREFIX,
      serve(uploadRoot, {
        maxage: 31536000000,
        immutable: true,
        defer: false,
      }),
    ),
  );

  app.use(apiRouter.routes());
  app.use(apiRouter.allowedMethods());
  app.use(notFoundHandler);

  return app;
}
