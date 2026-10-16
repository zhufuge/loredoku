import type { Knex } from 'knex';
import { CARD_ROTATIONS } from '@loredoku/shared';

export async function up(knex: Knex): Promise<void> {
  const rotations = CARD_ROTATIONS.join(', ');
  await knex.schema.createTable('map_cells', (table) => {
    table.bigIncrements('id').primary();
    table
      .bigInteger('project_id')
      .notNullable()
      .references('id')
      .inTable('map_projects')
      .onDelete('CASCADE')
      .onUpdate('CASCADE');
    table.integer('x').notNullable();
    table.integer('y').notNullable();
    table
      .bigInteger('card_id')
      .references('id')
      .inTable('cards')
      .onDelete('SET NULL')
      .onUpdate('CASCADE');
    table.smallint('rotation').notNullable().defaultTo(0);
    table.integer('z_index').notNullable().defaultTo(0);
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.unique(['project_id', 'x', 'y'], { indexName: 'uq_map_cells_project_xy' });
    table.check(`rotation IN (${rotations})`);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('map_cells');
}
