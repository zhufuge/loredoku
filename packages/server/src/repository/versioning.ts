import { db } from '../db/knex';

/** 版本号的唯一 SQL（v0.7.1 §5.1）：`maps` 与 `puzzles` 同构，共用一份口径。
 *  `CAST` 前先排 `'draft'`；必须含软删行（号不回收，否则引用对不上）；表名只接受本模块字面量。 */
export type VersionedTable = 'maps' | 'puzzles';

/** 血统内下一个可用版本号 = `MAX(含软删行) + 1`。 */
export async function nextVersionNo(table: VersionedTable, rootId: number): Promise<number> {
  const result = await db.raw(
    `SELECT COALESCE(MAX(CAST(version AS integer)), 0) AS max
       FROM ${table}
      WHERE root_id = ? AND version <> 'draft'`,
    [rootId],
  );
  const row = (result.rows[0] ?? {}) as { max?: string | number | null };
  return Number(row.max ?? 0) + 1;
}

/** 血统内该版本号是否已被占用（**含软删行**：号不回收）。 */
export async function versionNoTaken(
  table: VersionedTable,
  rootId: number,
  versionNo: number,
): Promise<boolean> {
  const row = await db(table).where({ root_id: rootId, version: String(versionNo) }).first('id');
  return Boolean(row);
}

/** 血统内的版本行（活行），版本号倒序 —— 版本历史面板与列表共用。 */
export async function listVersionRows<R>(table: VersionedTable, rootId: number): Promise<R[]> {
  return (await db(table)
    .where({ root_id: rootId })
    .whereNot('version', 'draft')
    .whereNull('deleted_at')
    .orderByRaw('CAST(version AS integer) DESC')) as R[];
}
