import type { Knex } from 'knex';

/**
 * v0.5.1 FEAT-L01 / FEAT-L02 (docs/v0.5.1.md §6.1) — optional **colour block**
 * appearance. `bg_color` is `#RRGGBB`: `NULL` = the pre-v0.5.1 image path (what
 * every existing row already is), a colour = a solid block activatable without an
 * upload. Nullable on purpose: no backfill, and `down` is a plain `DROP COLUMN`.
 * No map / puzzle JSON or game snapshot stores an item body, so nothing to rewrite.
 */
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
