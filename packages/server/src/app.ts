import Koa from 'koa';
import cors from 'koa2-cors';
import logger from 'koa-logger';
import { koaBody } from 'koa-body';
import mount from 'koa-mount';
import serve from 'koa-static';
import { resolve } from 'node:path';
import { FILES_ROUTE_PREFIX } from '@loredoku/shared';
import { errorHandler } from './middleware/errorHandler';
import { notFoundHandler } from './middleware/notFound';
import { spaFallback } from './middleware/spaFallback';
import { apiRouter } from './router';
import { uploadRoot, webDistRoot } from './utils/paths';

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

  // serve the web build so `npm start` alone can host the whole app.
  // Order matters — /api/* is already handled above; /assets misses must 404
  // instead of falling back to HTML (see spaFallback).
  app.use(
    mount(
      '/assets',
      serve(resolve(webDistRoot, 'assets'), {
        maxage: 31536000000,
        immutable: true,
        defer: false,
      }),
    ),
  );
  app.use(
    serve(webDistRoot, {
      maxage: 0,
      // index.html is the SPA entry: always revalidate, never let a CDN pin it.
      setHeaders(res, path) {
        if (path.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
      },
    }),
  );
  // notFoundHandler runs first and its next() enters spaFallback: once the
  // fallback answers, notFound sees a body and stands down; requests the
  // fallback leaves 404-marked fall through to the JSON 404. Registering the
  // fallback *after* notFound is deliberate — the other order lets notFound
  // fill in the JSON body first, and the fallback would never see a miss.
  app.use(notFoundHandler);
  app.use(spaFallback);

  return app;
}
