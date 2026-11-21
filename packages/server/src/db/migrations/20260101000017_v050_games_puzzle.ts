import type { Knex } from 'knex';

/** v0.5.0 CONS-K16（docs/v0.5.0.md §10.1/§11.1）：部署单位由「发布版本」改为「谜题」——puzzle_id 可空 + ON DELETE SET NULL（删谜题只降级为 legacy 行，不级联删游戏）；partial UNIQUE(WHERE puzzle_id IS NOT NULL) 保证一谜题一游戏又容许多条 legacy；旧 project_id UNIQUE 删除，同图不同版本可并行部署。 */
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
