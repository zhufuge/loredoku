import { ErrorCode, HTTP_STATUS_BY_ERROR_CODE, type ErrorCodeValue } from '@murdoku/shared';

export class AppError extends Error {
  readonly code: ErrorCodeValue;
  readonly httpStatus: number;
  readonly details: unknown;

  constructor(code: ErrorCodeValue, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = HTTP_STATUS_BY_ERROR_CODE[code] ?? 500;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }

  /**
   * Alias so generic HTTP middleware (koa-logger, koa's own error handling)
   * reports the real status instead of defaulting to 500 when an AppError
   * propagates through it before `errorHandler` converts it.
   */
  get status(): number {
    return this.httpStatus;
  }

  static notFound(message = '资源不存在'): AppError {
    return new AppError(ErrorCode.NOT_FOUND, message);
  }

  static conflict(message = '资源冲突'): AppError {
    return new AppError(ErrorCode.CONFLICT, message);
  }

  static validation(message = '参数校验失败', details?: unknown): AppError {
    return new AppError(ErrorCode.VALIDATION_FAILED, message, details);
  }

  static internal(message = '服务器内部错误'): AppError {
    return new AppError(ErrorCode.INTERNAL_ERROR, message);
  }
}
