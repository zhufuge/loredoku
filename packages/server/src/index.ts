import { createApp } from './app';
import { env } from './config/env';
import { db } from './db/knex';
import { logger } from './utils/logger';

async function bootstrap(): Promise<void> {
  try {
    await db.raw('select 1');
    logger.info('database connection ok');
  } catch (err) {
    logger.warn({ err }, 'database unavailable, server will start anyway');
  }

  const app = createApp();
  app.listen(env.PORT, env.HOST, () => {
    logger.info(`server listening on http://${env.HOST}:${env.PORT}`);
  });
}

void bootstrap();
