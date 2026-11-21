import type { Knex } from 'knex';
import {
  GAME_DIFFICULTY_LEVELS,
  GAME_NAME_MAX_LENGTH,
  GRID_SIZE_MAX,
  GRID_SIZE_MIN,
} from '@loredoku/shared';

/** v0.4.0 FEAT-G02（docs/v0.4.0.md §5.1）：map_games.snapshot 是部署时的固定副本，之后重发布不影响已部署游戏；project_id UNIQUE=一图一游戏，覆盖部署走同事务 delete+insert（gameRepository.upsert）；grid_size 反范式供列表页。 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('map_games', (table) => {
    table.bigIncrements('id').primary();
    table
      .bigInteger('project_id')
      .notNullable()
      .references('id')
      .inTable('map_projects')
      .onDelete('CASCADE');
    table.integer('version_no').notNullable();
    table.string('name', GAME_NAME_MAX_LENGTH).notNullable();
    table.text('cover_path');
    table.string('cover_mime', 64);
    table.integer('cover_size');
    table.integer('cover_width');
    table.integer('cover_height');
    table.string('difficulty', 16).notNullable();
    table.integer('grid_size').notNullable();
    table.jsonb('snapshot').notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.check(`grid_size >= ${GRID_SIZE_MIN} AND grid_size <= ${GRID_SIZE_MAX}`);
    table.unique(['project_id'], { indexName: 'map_games_project_id_unique' });
  });

  // Five tiers only — enforced in SQL as well as in the zod schema, so a bad
  // write from anywhere else is rejected instead of silently stored.
  const allowed = GAME_DIFFICULTY_LEVELS.map((level) => `'${level}'`).join(', ');
  await knex.raw(
    `ALTER TABLE map_games ADD CONSTRAINT map_games_difficulty_check ` +
      `CHECK (difficulty IN (${allowed}))`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('map_games');
}
