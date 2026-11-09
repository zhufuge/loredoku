import { db } from '../src/db/knex';

/**
 * v0.8.0 §19 —— 把主题**物理**删掉，测试收尾专用。
 *
 * v0.8.3 §15 之后 `DELETE /api/themes/:code` 本身就是硬删了，为什么还要留着这个：
 * 那个接口只会删**空**主题（有资源 / 地图 / 谜题 / 合辑一律 409），而夹具主题往往
 * 还挂着东西。收尾不能指望走接口 —— 得自己按外键顺序往下拆。
 *
 * 顺序由外键决定，全部 RESTRICT，没有一处能靠 CASCADE 混过去：
 * games → puzzles → assets（variants 跟着 CASCADE）→ characters → maps → themes。
 *
 * v0.9.2：`theme_deployments` 那一步没了 —— 两张表已被迁移删掉（`docs/v0.9.2.md`
 * §1），这里再 `del()` 一次只会撞上「表不存在」。
 *
 * `games` 只挂 `puzzle_id`（v0.7.1 起游戏属于谜题版本，不再直接挂地图），
 * 所以删游戏只能顺着谜题找。
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

/**
 * 早期用例用 `unique('t')` 造出来的临时主题：`t-1a2b3c4d`。
 *
 * 它们是 v0.8.0 之前留下的隐患（那时候删主题是软删，尸体行一直堆在库里）。
 * v0.8.3 §15 起主题是硬删、迁移也清过一遍存量，这条兜底基本不会再扫到东西 ——
 * 留着是因为它很便宜，而「测试不许污染库」这条规矩不该有例外。
 */
export const TEMP_THEME_CODE = /^t-[0-9a-f]{8}$/;

export async function purgeTempThemes(): Promise<number> {
  const rows = (await db('themes').select('code')) as Array<{ code: string }>;
  const codes = rows.map((row) => row.code).filter((code) => TEMP_THEME_CODE.test(code));
  for (const code of codes) await purgeTheme(code);
  return codes.length;
}
