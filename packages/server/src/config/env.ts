import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3000),
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:3000'),
  PGHOST: z.string().min(1).default('localhost'),
  PGPORT: z.coerce.number().int().positive().default(5432),
  PGUSER: z.string().min(1).default('postgres'),
  PGPASSWORD: z.string().default('123456'),
  PGDATABASE: z.string().min(1).default('murdoku'),
  UPLOAD_ROOT: z.string().min(1).default('./storage/uploads'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
  throw new Error(`环境变量校验失败: ${details}`);
}

export const env = parsed.data;
export type Env = typeof env;
