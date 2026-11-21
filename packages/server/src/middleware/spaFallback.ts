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

/** 托管 web 构建产物（`npm start` 独立可跑）；必须注册在 `notFoundHandler` 之后，否则它先写 JSON body 会让 fallback 全部失效。
 *  GET/HEAD 的非 /api、/assets 导航回 index.html 交给前端路由；其余标 404 让 notFound 出 JSON，/assets 缺失绝不能回 HTML（MIME 报错）。 */
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
