import { db } from '../src/db/knex';

/**
 * v0.8.0 §19：测试收尾物理删主题。`DELETE /api/themes/:code` 只删空主题（有资源 / 地图 / 谜题 / 合辑即 409），夹具得按外键顺序自己拆：games → puzzles → assets（variants 随 CASCADE）→ characters → maps → themes，全部 RESTRICT。
 */
export async function purgeTheme(code: string): Promise<void> {
  const row = (await db('themes').where({ code }).first('id')) as
    | { id: string | number }
    | undefined;
  if (!row) return;
  const themeId = Number(row.id);

  const puzzleIds = (await db('puzzles').where({ theme_id: themeId }).pluck('id')) as number[];
  if (puzzleIds.length > 0) {
    await db('games').whereIn('puzzle_id', puzzleIds).del();
  }
  await db('puzzles').where({ theme_id: themeId }).del();
  await db('assets').where({ theme_id: themeId }).del();
  await db('characters').where({ theme_id: themeId }).del();
  await db('maps').where({ theme_id: themeId }).del();
  await db('themes').where({ id: themeId }).del();
}

/** 早期用例用 `unique('t')` 造出来的临时主题：`t-1a2b3c4d`。 v0.8.3 §15：主题是硬删、迁移也清过一遍存量，这条兜底基本不会再扫到东西 —— 留着是因为它很便宜，而「测试不许污染库」这条规矩不该有例外。 */
export const TEMP_THEME_CODE = /^t-[0-9a-f]{8}$/;

export async function purgeTempThemes(): Promise<number> {
  const rows = (await db('themes').select('code')) as Array<{ code: string }>;
  const codes = rows.map((row) => row.code).filter((code) => TEMP_THEME_CODE.test(code));
  for (const code of codes) await purgeTheme(code);
  return codes.length;
}
