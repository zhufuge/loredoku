import type { Context } from 'koa';
import { db } from '../db/knex';
import { success } from '../utils/response';

export async function getHealth(ctx: Context): Promise<void> {
  let database: 'up' | 'down' = 'down';
  try {
    await db.raw('select 1');
    database = 'up';
  } catch {
    database = 'down';
  }

  success(ctx, {
    status: 'ok',
    database,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
}
