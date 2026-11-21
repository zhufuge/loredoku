import type { Knex } from 'knex';

/** v0.5.1 FEAT-L01/L02（docs/v0.5.1.md §6.1）：items/characters 加 bg_color（#RRGGBB 纯色块）；NULL=沿用 v0.5.1 前的图片路径，故意可空——无回填，down 只 DROP COLUMN。 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('items', (table) => {
    table.text('bg_color').nullable();
  });
  await knex.schema.alterTable('characters', (table) => {
    table.text('bg_color').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('characters', (table) => {
    table.dropColumn('bg_color');
  });
  await knex.schema.alterTable('items', (table) => {
    table.dropColumn('bg_color');
  });
}
