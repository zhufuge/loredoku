import type { Knex } from 'knex';

/** v0.5.2（docs/v0.5.2.md §3/§4/§9.1）：顺序即依赖——先把背景物品 can_stand 回填 true，再 DROP TABLE item_triggers 与 items.meta（二者自 v0.5.0 起无读写路径）；都不进 JSON 快照，无需回填；down 只重建空结构，数据不可恢复。 */
export async function up(knex: Knex): Promise<void> {
  await knex('items').where({ category: 'background' }).update({ can_stand: true });

  await knex.schema.dropTableIfExists('item_triggers');

  await knex.schema.alterTable('items', (table) => {
    table.dropColumn('meta');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('items', (table) => {
    table.jsonb('meta').notNullable().defaultTo('{}');
  });

  await knex.schema.createTable('item_triggers', (table) => {
    table.increments('id').primary();
    table.integer('item_id').notNullable().references('id').inTable('items').onDelete('CASCADE');
    table.string('trigger_key', 64).notNullable();
    table.string('trigger_value', 255).notNullable();
    table.string('effect_type', 16).notNullable();
    table.jsonb('effect_config').notNullable().defaultTo('{}');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw('CREATE INDEX idx_item_triggers_item ON item_triggers(item_id)');
  await knex.raw('CREATE INDEX idx_item_triggers_kv ON item_triggers(trigger_key, trigger_value)');
}
