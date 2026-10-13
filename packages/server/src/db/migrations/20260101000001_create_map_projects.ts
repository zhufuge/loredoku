import type { Knex } from 'knex';
import { GRID_SIZE_MAX, GRID_SIZE_MIN } from '@murdoku/shared';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('map_projects', (table) => {
    table.bigIncrements('id').primary();
    table.string('name', 100).notNullable();
    table.text('description');
    table.integer('grid_size').notNullable();
    table.text('cover_path');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.check(`grid_size >= ${GRID_SIZE_MIN} AND grid_size <= ${GRID_SIZE_MAX}`);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('map_projects');
}
