import type { Knex } from 'knex';

/** v0.7.6（docs/v0.7.6.md）：删 characters.avatar_mime / meta（只写不读）；avatar_size / width / height 不动——它们描述原图，磁盘上只留 256px 缩略图；down 按 avatar_path 扩展名补回 mime。 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('characters', (table) => {
    table.dropColumn('avatar_mime');
    table.dropColumn('meta');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('characters', (table) => {
    table.string('avatar_mime', 64);
    table.jsonb('meta').notNullable().defaultTo(knex.raw(`'{}'::jsonb`));
  });
  // 回滚时按 `avatar_path` 的扩展名补齐 mime，让降级后的服务仍能读到「有值」。
  await knex.raw(`
    UPDATE characters
       SET avatar_mime = CASE lower(substring(avatar_path from '\\.([a-z0-9]+)$'))
                           WHEN 'png'  THEN 'image/png'
                           WHEN 'jpg'  THEN 'image/jpeg'
                           WHEN 'jpeg' THEN 'image/jpeg'
                           WHEN 'webp' THEN 'image/webp'
                           WHEN 'svg'  THEN 'image/svg+xml'
                         END
     WHERE avatar_path IS NOT NULL
  `);
}
