import type { Knex } from 'knex';
import type { GameDifficulty } from '@loredoku/shared';
import { backfillGameSlugs } from '../../service/gameSlugBackfill';

/**
 * v0.4.1 OPT-W04 (docs/v0.4.1.md §4.5): every deployed game gets a
 * human-readable access path — `/games/{slug}` replaces `/games/{id}`.
 *
 * The column is added nullable, filled for the rows that already exist (their
 * path is derived from the name + difficulty they were deployed with), and
 * only then tightened to `NOT NULL UNIQUE`. Two maps may derive the same path,
 * so the backfill walks the rows in id order and appends `-2`, `-3`, … to the
 * later one; a fresh deploy never does that — it reports the clash instead
 * (docs/v0.4.1.md §4.4, §14 Q12). The derivation itself lives in
 * `server/src/service/gameSlugBackfill.ts`, where it is unit tested (helpers
 * must not sit inside this directory — see README「约定」).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('map_games', (table) => {
    table.string('slug', 80);
  });

  const rows = (await knex('map_games').select('id', 'name', 'difficulty').orderBy('id')) as Array<{
    id: string | number;
    name: string;
    difficulty: GameDifficulty;
  }>;

  const slugs = backfillGameSlugs(rows);
  for (const [id, slug] of slugs) {
    await knex('map_games').where({ id }).update({ slug });
  }

  await knex.schema.alterTable('map_games', (table) => {
    table.string('slug', 80).notNullable().alter();
  });
  await knex.schema.alterTable('map_games', (table) => {
    table.unique(['slug'], { indexName: 'map_games_slug_unique' });
  });
}

export async function down(knex: Knex): Promise<void> {
  // `table.unique(…, { indexName })` creates a UNIQUE **constraint**, not a bare
  // index, so it must be dropped as a constraint — `DROP INDEX` fails with
  // 2BP01 ("constraint … requires it").
  await knex.schema.alterTable('map_games', (table) => {
    table.dropUnique(['slug'], 'map_games_slug_unique');
  });
  await knex.schema.alterTable('map_games', (table) => {
    table.dropColumn('slug');
  });
}
