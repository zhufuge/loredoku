import type { Context } from 'koa';
import { ErrorCode, type ApiFailure, type ApiSuccess } from '@murdoku/shared';

export function success<T>(ctx: Context, data: T, message = 'ok'): void {
  const body: ApiSuccess<T> = { code: 0, message, data };
  ctx.status = 200;
  ctx.body = body;
}

export function failure(ctx: Context, code: number, message: string, httpStatus = 500): void {
  const body: ApiFailure = { code, message, data: null };
  ctx.status = httpStatus;
  ctx.body = body;
}

export function notImplemented(ctx: Context, message = '接口尚未实现'): void {
  failure(ctx, ErrorCode.INTERNAL_ERROR, message, 501);
}
