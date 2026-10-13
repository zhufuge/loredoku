import type { Knex } from 'knex';
import {
  DEFAULT_REGION_COLOR,
  REGION_BORDER_WIDTH_DEFAULT,
  REGION_FILL_OPACITY_DEFAULT,
} from '@murdoku/shared';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('map_regions', (table) => {
    table.bigIncrements('id').primary();
    table
      .bigInteger('project_id')
      .notNullable()
      .references('id')
      .inTable('map_projects')
      .onDelete('CASCADE')
      .onUpdate('CASCADE');
    table.string('name', 100).notNullable();
    table.text('description');
    table.string('color', 16).notNullable().defaultTo(DEFAULT_REGION_COLOR);
    table.smallint('border_width').notNullable().defaultTo(REGION_BORDER_WIDTH_DEFAULT);
    table
      .decimal('fill_opacity', 3, 2)
      .notNullable()
      .defaultTo(REGION_FILL_OPACITY_DEFAULT);
    table.jsonb('meta').notNullable().defaultTo(knex.raw(`'{}'::jsonb`));
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('map_regions');
}
