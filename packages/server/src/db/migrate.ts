import { db } from './knex';
import { logger } from '../utils/logger';

async function run(): Promise<void> {
  logger.info('running migrations...');
  const [batch, migrations] = await db.migrate.latest();
  if (migrations.length === 0) {
    logger.info('already up to date');
  } else {
    logger.info({ batch, count: migrations.length, migrations }, 'migrations completed');
  }
}

run()
  .catch((err: unknown) => {
    logger.error({ err }, 'migration failed');
    process.exitCode = 1;
  })
  .finally(() => {
    void db.destroy();
  });
