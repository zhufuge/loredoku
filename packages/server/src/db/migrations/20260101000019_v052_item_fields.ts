import type { Knex } from 'knex';

/**
 * v0.5.2 — 物品字段瘦身（docs/v0.5.2.md §3 / §4 / §9.1）
 *
 * 三件事，顺序即依赖：
 *
 * 1. **FEAT-M04 回填**：背景类型物品恒定可站立 —— 存量行里 `can_stand = false`
 *    的背景物品一律抬成 `true`。先做这一步，后面的删除不会影响它。
 * 2. **FEAT-M03 删表**：`item_triggers` 整表删除（两个索引随之消失）。
 *    触发信息在 v0.5.0 起就已不在任何读写路径上被消费。
 * 3. **FEAT-M03 删列**：`items.meta` 删除。自由扩展信息没有业务读路径。
 *
 * 两张结构都不进任何 JSON 快照（物品本体不进 `MapDraft` / `PuzzleDraft`，
 * v0.5.1 已确认），因此对已部署游戏零影响，无需回填 JSON。
 */
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
