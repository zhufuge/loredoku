import type { Context, Next } from 'koa';
import { ZodError } from 'zod';
import { ErrorCode } from '@loredoku/shared';
import { AppError } from '../utils/AppError';
import { failure } from '../utils/response';
import { logger } from '../utils/logger';

function isKoaHttpError(err: unknown): err is { status: number; message: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'status' in err &&
    typeof (err as { status: unknown }).status === 'number'
  );
}

export async function errorHandler(ctx: Context, next: Next): Promise<void> {
  try {
    await next();
  } catch (err) {
    if (err instanceof AppError) {
      ctx.status = err.httpStatus;
      ctx.body = { code: err.code, message: err.message, data: err.details ?? null };
      return;
    }

    if (err instanceof ZodError) {
      const details = err.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      failure(ctx, ErrorCode.VALIDATION_FAILED, '参数校验失败', 400);
      ctx.body = { code: ErrorCode.VALIDATION_FAILED, message: '参数校验失败', data: { details } };
      return;
    }

    if (typeof err === 'object' && err !== null && 'code' in err) {
      const code = (err as { code?: string }).code;
      if (code === 'LIMIT_FILE_SIZE') {
        failure(ctx, ErrorCode.FILE_TOO_LARGE, '文件超过大小限制', 413);
        return;
      }
      if (code === 'LIMIT_UNEXPECTED_FILE' || code === 'LIMIT_FILE_COUNT') {
        failure(ctx, ErrorCode.VALIDATION_FAILED, '上传字段不合法', 400);
        return;
      }
    }

    if (isKoaHttpError(err) && err.status < 500) {
      failure(ctx, ErrorCode.VALIDATION_FAILED, err.message, err.status);
      return;
    }

    logger.error({ err, path: ctx.path }, 'unhandled error');
    failure(ctx, ErrorCode.INTERNAL_ERROR, '服务器内部错误', 500);
  }
}
