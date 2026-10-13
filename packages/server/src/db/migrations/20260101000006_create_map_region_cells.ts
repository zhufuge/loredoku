import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('map_region_cells', (table) => {
    table
      .bigInteger('region_id')
      .notNullable()
      .references('id')
      .inTable('map_regions')
      .onDelete('CASCADE')
      .onUpdate('CASCADE');
    table.integer('x').notNullable();
    table.integer('y').notNullable();
    table.primary(['region_id', 'x', 'y']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('map_region_cells');
}
