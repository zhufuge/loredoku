import type { Knex } from 'knex';

/** v0.9.2（docs/v0.9.2.md §1）：删 theme_deployments / theme_deployment_puzzles（v0.8.0 §9 的「合辑」）——顺序已由 games.sort_weight 承担（两套顺序会互相冲突），交付变成一个 manifest 包、合辑那层没有对应物；**数据会没**：合辑名/描述/封面/成员顺序不可恢复，但 games 部署行不受影响。 */
export async function up(knex: Knex): Promise<void> {
  // 先删成员表：它有一条指向 `theme_deployments` 的外键（CASCADE），倒着删会让
  // Postgres 先抱怨依赖。`IF EXISTS` 是给「只跑了一半又重跑」留的余地。
  await knex.schema.dropTableIfExists('theme_deployment_puzzles');
  await knex.schema.dropTableIfExists('theme_deployments');
}

/** 回滚：把两张表按 v0.8.0 的原样装回去（含唯一约束、外键与那条 `puzzle_id` 索引）。 只恢复**结构**，不恢复数据 —— 删表时行已经跟着没了。回滚之后代码（不认识合辑） 仍能正常跑，两张表会是空的。真要回到「有合辑」的版本，回滚这一条 + 回滚代码即可。 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.createTable('theme_deployments', (table) => {
    table.bigIncrements('id').primary();
    table
      .bigInteger('theme_id')
      .notNullable()
      .references('id')
      .inTable('themes')
      .onDelete('RESTRICT');
    table.string('slug', 64).notNullable().unique();
    table.string('name', 100).notNullable();
    table.string('description', 500);
    table.text('cover_path');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.schema.createTable('theme_deployment_puzzles', (table) => {
    table
      .bigInteger('deployment_id')
      .notNullable()
      .references('id')
      .inTable('theme_deployments')
      .onDelete('CASCADE');
    table
      .bigInteger('puzzle_id')
      .notNullable()
      .references('id')
      .inTable('puzzles')
      .onDelete('CASCADE');
    table.integer('sort_order').notNullable().defaultTo(0);
    table.primary(['deployment_id', 'puzzle_id']);
  });
  await knex.raw(
    'CREATE INDEX idx_theme_deployment_puzzles_puzzle ON theme_deployment_puzzles (puzzle_id)',
  );
}
