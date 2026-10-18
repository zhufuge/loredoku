import { createReadStream, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Context, Next } from 'koa';
import { webDistRoot } from '../utils/paths';

const indexHtml = resolve(webDistRoot, 'index.html');

function isApiOrAssetPath(path: string): boolean {
  return (
    path === '/api' ||
    path.startsWith('/api/') ||
    path === '/assets' ||
    path.startsWith('/assets/')
  );
}

/**
 * serve the web build so `npm start` alone can host the whole app.
 * Registered LAST (after notFoundHandler) on purpose: notFound's next() enters
 * this middleware, so a body it sets only materialises after we have already
 * decided. The other order deadlocks the fallback — notFound fills the JSON
 * body first and `ctx.body != null` then blocks every miss.
 * Boundaries for the requests nobody answered (`ctx.body == null` here):
 *   - GET/HEAD navigation outside /api and /assets → index.html, so the client
 *     router can take over deep links like /play/some-slug;
 *   - everything else (a missing asset, a POST to an unknown path) is marked
 *     404 so notFoundHandler answers JSON — an unhandled request would
 *     otherwise fall through to Koa's plain-text "Not Found".
 * /api/* is already answered (or 404-marked) by the router; /assets misses
 * must never be answered with HTML or the browser fails with a MIME error.
 * No dist yet (dev without a build): every path falls to the JSON 404, which
 * is the pre-v0.5.6 behaviour.
 */
export async function spaFallback(ctx: Context, next: Next): Promise<void> {
  await next();
  if (ctx.body != null) return;
  if (ctx.method === 'GET' || ctx.method === 'HEAD') {
    if (!isApiOrAssetPath(ctx.path) && existsSync(indexHtml)) {
      ctx.status = 200;
      ctx.type = 'html';
      ctx.set('Cache-Control', 'no-cache');
      ctx.body = createReadStream(indexHtml);
      return;
    }
  }
  ctx.status = 404;
}
