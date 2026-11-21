import type { Knex } from 'knex';

/** 删 maps.draft_updated_at：它只是草稿修订号（保存时当乐观并发 CAS 令牌），「先不做锁」后改后写覆盖、已无消费者，整列移除以免后来人误以为有并发保护；down 只加回空列（历史值不可重建）。 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('maps', (table) => {
    table.dropColumn('draft_updated_at');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('maps', (table) => {
    table.timestamp('draft_updated_at', { useTz: true });
  });
}
