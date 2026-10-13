import type { Knex } from 'knex';
import { fileURLToPath } from 'node:url';
import { env } from '../config/env';

const migrationsDirectory = fileURLToPath(new URL('./migrations', import.meta.url));
const seedsDirectory = fileURLToPath(new URL('./seeds', import.meta.url));

export function buildKnexConfig(): Knex.Config {
  return {
    client: 'pg',
    connection: {
      host: env.PGHOST,
      port: env.PGPORT,
      user: env.PGUSER,
      password: env.PGPASSWORD,
      database: env.PGDATABASE,
    },
    pool: { min: 0, max: 10 },
    migrations: {
      directory: migrationsDirectory,
      extension: 'ts',
      loadExtensions: ['.ts'],
      tableName: 'knex_migrations',
    },
    seeds: {
      directory: seedsDirectory,
      extension: 'ts',
      loadExtensions: ['.ts'],
    },
  };
}
