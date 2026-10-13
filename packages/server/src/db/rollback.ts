import { db } from './knex';
import { logger } from '../utils/logger';

async function run(): Promise<void> {
  logger.info('rolling back last migration batch...');
  const [batch, migrations] = await db.migrate.rollback();
  logger.info({ batch, count: migrations.length, migrations }, 'rollback completed');
}

run()
  .catch((err: unknown) => {
    logger.error({ err }, 'rollback failed');
    process.exitCode = 1;
  })
  .finally(() => {
    void db.destroy();
  });
