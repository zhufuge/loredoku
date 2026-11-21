import { afterAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/knex';

/** `characters` 只有一条头像路径（docs/v0.7.6.md）：两个迁移（00033 / 00034）跑完后的**最终列集合**里不该再有图像元数据列。 */

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
