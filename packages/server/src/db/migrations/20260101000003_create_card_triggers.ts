import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('card_triggers', (table) => {
    table.bigIncrements('id').primary();
    table
      .bigInteger('card_id')
      .notNullable()
      .references('id')
      .inTable('cards')
      .onDelete('CASCADE')
      .onUpdate('CASCADE');
    table.string('trigger_key', 64).notNullable();
    table.string('trigger_value', 255).notNullable();
    table.string('effect_type', 32).notNullable();
    table.jsonb('effect_config').notNullable().defaultTo(knex.raw(`'{}'::jsonb`));
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('card_triggers');
}
