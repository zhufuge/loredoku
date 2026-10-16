import type { Knex } from 'knex';

/**
 * v0.5.0 CONS-K16 (docs/v0.5.0.md §10.1 / §11.1) — the unit of deployment moves
 * from "one published version" to "one puzzle".
 *
 * - `puzzle_id` is added, nullable, `ON DELETE SET NULL`; deleting a puzzle
 *   therefore demotes its game to a legacy (puzzle-less) one instead of
 *   cascading the delete over a game players may be using.
 * - A **partial** unique index keeps "one game per puzzle" while allowing any
 *   number of legacy rows with `puzzle_id IS NULL` — a plain UNIQUE constraint
 *   would let at most one NULL-puzzle row survive on some engines, and on
 *   PostgreSQL it would also silently permit duplicates among NULLs.
 * - The old `project_id` UNIQUE is **dropped**: different versions of the same
 *   map may now be deployed by different puzzles at the same time.
 *
 * `project_id` / `version_no` keep their meaning as the referenced map version,
 * which is why the drop above is safe — nothing else reads them as an identity.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('map_games', (table) => {
    table
      .bigInteger('puzzle_id')
      .references('id')
      .inTable('puzzles')
      .onDelete('SET NULL')
      .onUpdate('CASCADE');
  });

  await knex.raw(
    'CREATE UNIQUE INDEX map_games_puzzle_id_unique ON map_games (puzzle_id) WHERE puzzle_id IS NOT NULL',
  );

  // `table.unique(…, { indexName })` created a UNIQUE **constraint** in
  // 20260101000014, so it must be dropped as one (DROP INDEX fails with 2BP01).
  await knex.schema.alterTable('map_games', (table) => {
    table.dropUnique(['project_id'], 'map_games_project_id_unique');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('map_games', (table) => {
    table.unique(['project_id'], { indexName: 'map_games_project_id_unique' });
  });
  await knex.raw('DROP INDEX IF EXISTS map_games_puzzle_id_unique');
  await knex.schema.alterTable('map_games', (table) => {
    table.dropColumn('puzzle_id');
  });
}
