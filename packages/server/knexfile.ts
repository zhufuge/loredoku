import type { Knex } from 'knex';
import { buildKnexConfig } from './src/db/config';

const config: Knex.Config = buildKnexConfig();

export default config;
