import type { Knex } from 'knex';

/**
 * 删掉 `maps.draft_updated_at`。
 *
 * 这一列唯一的用处是「草稿修订号」——编辑器保存时把它回传当乐观并发的 CAS
 * 令牌（不一致就 409「草稿已被其他会话修改」）。既然定下「先不做锁」，保存
 * 改成后写覆盖，修订号就没有消费者了：
 *
 * - 列表排序用 `updated_at`（改名 / 换封面 / 保存草稿都会推它），与本列无关；
 * - 地图详情响应不再带 `updatedAt`，前端 store 里也没有这个字段了。
 *
 * 所以不是「留着不用」，而是整列移除 —— 留着会诱使后来人以为并发保护还在。
 * down 只把列加回来（历史值无法重建，全是 NULL，与「从没保存过」同义）。
 */
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
