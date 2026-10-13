import knexFactory from 'knex';
import { buildKnexConfig } from './config';

export const db = knexFactory(buildKnexConfig());

export type Database = typeof db;
