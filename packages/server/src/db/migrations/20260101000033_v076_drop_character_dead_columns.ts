import type { Knex } from 'knex';

/**
 * v0.7.6 —— 删掉 `characters` 上两列**只写不读**的字段（docs/v0.7.6.md）。
 *
 *   - `avatar_mime`：上传时写入，全仓没有读方。静态托管按**文件扩展名**给
 *     Content-Type，`avatar_path` 的尾巴已经把 mime 定死了，这一列只是同一件
 *     事的第二份记录。
 *   - `meta`：v0.2.0 建表时留的「扩展」位，`jsonb NOT NULL DEFAULT '{}'`。
 *     从来没有 UI、没有读方；v0.5.2 删 `assets.meta` 时点名「角色侧留待后续」，
 *     这次一并处理。
 *
 * `avatar_size` / `avatar_width` / `avatar_height` **不动**：它们描述的是**原图**，
 * 而磁盘上留下的是 256px 缩略图，原图尺寸从文件反推不出来 —— 角色详情的
 * 「1024 × 768 · 123 KB」那一行还在用。
 *
 * 迁移前实测（本机库）：40 行角色，`meta` 全部是 `{}`（非空 0 行），
 * `avatar_mime` 有 38 行有值且与 `avatar_path` 的扩展名一一对应。所以这次
 * 删列不丢任何**不可再生的**信息。
 */
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
