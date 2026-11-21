import type { Knex } from 'knex';

/** v0.7.6 §2.4：删 characters 的 avatar_size/width/height（原图回执，只是可从文件重算的缓存；三类封面只存路径已是同一做法）；down 只加回空列、值补不回，上传区那行退化为「已上传」。 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('characters', (table) => {
    table.dropColumn('avatar_size');
    table.dropColumn('avatar_width');
    table.dropColumn('avatar_height');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('characters', (table) => {
    table.integer('avatar_size');
    table.integer('avatar_width');
    table.integer('avatar_height');
  });
}
