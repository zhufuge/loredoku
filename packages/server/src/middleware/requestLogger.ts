import type { Context, Next } from 'koa';
import { logger } from '../utils/logger';

/** 一行一条请求日志；替代 koa-logger，和错误/迁移日志共用 pino。 */
export async function requestLogger(ctx: Context, next: Next): Promise<void> {
  const startedAt = Date.now();
  await next();
  logger.info(
    { method: ctx.method, path: ctx.path, status: ctx.status, ms: Date.now() - startedAt },
    'request',
  );
}
