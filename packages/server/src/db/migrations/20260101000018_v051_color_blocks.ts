import type { Knex } from 'knex';

/**
 * v0.5.1 FEAT-L01 / FEAT-L02 (docs/v0.5.1.md §6.1) — items and characters gain
 * an optional **colour block** appearance.
 *
 * `bg_color` holds a `#RRGGBB` string:
 * - `NULL` → the entry renders as its uploaded image (the pre-v0.5.1 path, and
 *   what every existing row already is);
 * - a colour → the entry renders as a solid block of that colour and can be
 *   activated **without any upload at all**.
 *
 * The column is nullable on purpose: no backfill is needed, and the down
 * migration is a plain `DROP COLUMN`. Nothing in the map / puzzle JSON or in a
 * game snapshot stores an item / character body, so no stored document needs
 * rewriting either (§6.3).
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
