import type { Context, Next } from 'koa';
import { ErrorCode } from '@loredoku/shared';
import { failure } from '../utils/response';

export async function notFoundHandler(ctx: Context, next: Next): Promise<void> {
  await next();
  if (ctx.status === 404 && ctx.body == null) {
    failure(ctx, ErrorCode.NOT_FOUND, '资源不存在', 404);
  }
}
