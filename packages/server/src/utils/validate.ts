import type { z } from 'zod';
import { AppError } from './AppError';

export function parseOrThrow<Output>(
  schema: z.ZodType<Output, z.ZodTypeDef, unknown>,
  data: unknown,
): Output {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    throw AppError.validation('参数校验失败', details);
  }
  return result.data;
}
