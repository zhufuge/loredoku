import type { Knex } from 'knex';

/**
 * v0.7.6 第二刀 —— 删掉 `characters` 的**原图回执**三列（docs/v0.7.6.md §2.4）。
 *
 * 第一刀（迁移 00033）删了 `avatar_mime` / `meta`：那是**零信息**的两列。
 * 这一刀删的三列不是零信息，只是**缓存**：
 *
 *   - 唯一的读方是 `ImageUploader` 那行「1024 × 768 · 123 KB」；
 *   - 而那行显示的是**原图**的尺寸与字节，界面实际画的是 256px 缩略图
 *     （`preview = thumbUrl ?? imageUrl`），原图只在缩略图加载失败时兜底；
 *   - 原图字节仍在磁盘上，尺寸 / 大小随时能重新读出来（`sharp.metadata()` /
 *     `stat`），所以这三列存的是「一条可推导的信息」。
 *
 * 一致性理由更硬：本项目后来做的三类封面——`maps.cover_path`、
 * `games.cover_path`、`puzzles.cover_path`——**只存路径**，它们走的是同一个
 * `processImage`，四个值照算不误，只是选择不落库。本迁移让 `characters`
 * 向这个已经用了三次的做法对齐。
 *
 * `down` 只能把列加回来，**值补不回来**：这三个数只存在于图片文件里，迁移不
 * 去翻文件系统。回滚后列为 NULL，上传区那行退化成「已上传」（见 ImageUploader
 * 的条件渲染），不会出现「? × ?」。
 */
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
