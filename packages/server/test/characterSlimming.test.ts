import { afterAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/knex';

/**
 * v0.7.6 —— `characters` 只剩「一条路径」：头像相关列从 5 个收到 1 个
 * （docs/v0.7.6.md）。
 *
 * 第一刀 00033：`avatar_mime`（可由扩展名推出）、`meta`（零读方、零信息）；
 * 第二刀 00034：`avatar_size` / `avatar_width` / `avatar_height`（只喂上传区
 * 一行说明，且镜像了本项目三类封面的做法 —— 那三处只存 `cover_path`）。
 *
 * 这个用例盯的是**最终列集合**，不是某一版迁移的中间态：两个迁移都在同一个
 * 库里跑完之后，`characters` 不该再有任何图像元数据列。
 */

async function characterColumns(): Promise<string[]> {
  const rows = (await db('information_schema.columns')
    .where({ table_name: 'characters', table_schema: 'public' })
    .select('column_name')
    .orderBy('ordinal_position')) as Array<{ column_name: string }>;
  return rows.map((row) => row.column_name);
}

describe('v0.7.6 角色表瘦身', () => {
  it('不再有任何头像元数据列', async () => {
    const columns = await characterColumns();
    for (const gone of [
      'avatar_mime',
      'avatar_size',
      'avatar_width',
      'avatar_height',
      'meta',
    ]) {
      expect(columns).not.toContain(gone);
    }
  });

  it('头像只剩 avatar_path 一列，其余业务列照旧', async () => {
    const columns = await characterColumns();
    expect(columns.filter((name) => name.startsWith('avatar_'))).toEqual(['avatar_path']);
    expect(columns).toEqual(
      expect.arrayContaining(['code', 'name', 'gender', 'description', 'bg_color', 'is_active']),
    );
  });
});

afterAll(async () => {
  await db.destroy();
});
