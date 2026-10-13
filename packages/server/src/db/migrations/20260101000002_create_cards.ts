import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('cards', (table) => {
    table.bigIncrements('id').primary();
    table.string('code', 64).notNullable().unique();
    table.string('name', 100).notNullable();
    table.text('image_path');
    table.string('image_mime', 64);
    table.integer('image_size');
    table.integer('image_width');
    table.integer('image_height');
    table.jsonb('meta').notNullable().defaultTo(knex.raw(`'{}'::jsonb`));
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('cards');
}
