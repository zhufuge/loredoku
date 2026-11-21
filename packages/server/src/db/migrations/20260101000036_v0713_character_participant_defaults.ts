import type { Knex } from 'knex';

/** v0.7.13（docs/v0.7.13.md §11）：characters 加 color / display_name 作「成为参与者时的默认值」；均可空且语义是「没有默认」（NULL→DEFAULT_THEME_COLOR / 序号），不回填、不改已有行；单独成列是因为 bg_color 是角色长相、color 是给槽位的主题色；down 两刀 DROP COLUMN，只丢用户后填的默认值。 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('characters', (table) => {
    table.text('color').nullable();
    table.text('display_name').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('characters', (table) => {
    table.dropColumn('display_name');
    table.dropColumn('color');
  });
}
