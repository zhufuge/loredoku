import type { Knex } from 'knex';

/**
 * v0.9.2（docs/v0.9.2.md §1）—— 删掉「合辑」这两张表。
 *
 * `theme_deployments`（一行 = 一个合辑）与 `theme_deployment_puzzles`（成员 +
 * 顺序）是 v0.8.0 §9 引入的：那时「一个主题上线」被想成一次**策展**，作者挑几关、
 * 排个阅读顺序，玩家从 `/play/theme/:slug` 走一遍。
 *
 * 后来两件事把它挤掉了：
 *
 *   1. **顺序有了自己的位置。** v0.8.3 给 `games` 加了 `sort_weight`，v0.8.5 让作者
 *      在部署页就地改。合辑的 `sort_order` 于是成了第二套顺序，两边不一致时谁也不
 *      知道该信谁 —— 导出包按合辑排，部署页按权重排。
 *   2. **交付变成「一个包」。** 播放器（`/loredoku/...`）吃的是 `manifest.json`，
 *      关卡列表就在包里；合辑那层目录在包里没有对应物，只剩一个 slug 没人读。
 *
 * 删表而不是留着不读：留两张空的目录表，下一个人会以为「合辑」还有语义，然后为它
 * 写第二套判断。跟 v0.8.0 删 `themes.is_default` 是同一条理由 —— 库里不该有
 * 「历史遗留的承诺」。
 *
 * **数据会没**：合辑名、描述、封面、成员顺序都不再存在。关卡的部署行（`games`）
 * 不受影响 —— 合辑只是目录，删目录不动内容，单局仍然在线。
 */
export async function up(knex: Knex): Promise<void> {
  // 先删成员表：它有一条指向 `theme_deployments` 的外键（CASCADE），倒着删会让
  // Postgres 先抱怨依赖。`IF EXISTS` 是给「只跑了一半又重跑」留的余地。
  await knex.schema.dropTableIfExists('theme_deployment_puzzles');
  await knex.schema.dropTableIfExists('theme_deployments');
}

/**
 * 回滚：把两张表按 v0.8.0 的原样装回去（含唯一约束、外键与那条 `puzzle_id` 索引）。
 *
 * 只恢复**结构**，不恢复数据 —— 删表时行已经跟着没了。回滚之后代码（不认识合辑）
 * 仍能正常跑，两张表会是空的。真要回到「有合辑」的版本，回滚这一条 + 回滚代码即可。
 */
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
