import { db } from '../src/db/knex';

/**
 * v0.8.0 §19 —— 把主题**物理**删掉，测试收尾专用。
 *
 * 为什么必须亲手做：`DELETE /api/themes/:code` 是软删（一条 UPDATE），而
 * `themes.code` 是普通 UNIQUE —— 软删的行还占着那个编码，行本身也永远不会消失。
 * 夹具每跑一次就留一具尸体，跑几十次 `themes` 表就没法看了（§19 之前积了 78 个）。
 *
 * 顺序由外键决定，全部 RESTRICT，没有一处能靠 CASCADE 混过去：
 * games → theme_deployments → puzzles → assets（variants 跟着 CASCADE）→
 * characters → maps → themes。
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
  await db('theme_deployments').where({ theme_id: themeId }).del();
  await db('puzzles').where({ theme_id: themeId }).del();
  await db('assets').where({ theme_id: themeId }).del();
  await db('characters').where({ theme_id: themeId }).del();
  await db('maps').where({ theme_id: themeId }).del();
  await db('themes').where({ id: themeId }).del();
}

/**
 * 规格与 `unique('t')` 造出来的临时主题：`t-1a2b3c4d`。
 *
 * 它们全部是**软删状态**（用例跑完自己软删过），所以在这里一律清干净 ——
 * 一个都不该留下。
 */
export const TEMP_THEME_CODE = /^t-[0-9a-f]{8}$/;

export async function purgeTempThemes(): Promise<number> {
  const rows = (await db('themes').select('code')) as Array<{ code: string }>;
  const codes = rows.map((row) => row.code).filter((code) => TEMP_THEME_CODE.test(code));
  for (const code of codes) await purgeTheme(code);
  return codes.length;
}
