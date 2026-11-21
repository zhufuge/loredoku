import type { Knex } from 'knex';
import type { GameDifficulty } from '@loredoku/shared';
import { backfillGameSlugs } from '../../service/gameSlugBackfill';

/** v0.4.1 OPT-W04（docs/v0.4.1.md §4.5）：路由 /games/{slug} 取代 {id}；slug 先可空回填（按 id 顺序给撞名的后者加 -2/-3）再收紧 NOT NULL UNIQUE，新部署撞名报错不自动加后缀（§4.4、§14 Q12）。 */
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
