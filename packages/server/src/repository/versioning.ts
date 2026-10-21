import { db } from '../db/knex';

/**
 * 版本号的**唯一一处** SQL（v0.7.1 §5.1）：`maps` 与 `puzzles` 的版本语义完全
 * 同构，两条查询各写一份就是两份口径，改错一次两个模块一起错。
 *
 * 三条铁律，任何调用方都不用再操心：
 *
 * 1. `CAST` 前先排掉 `'draft'` —— `CAST('draft' AS integer)` 直接抛错。
 * 2. **含软删行**：号不回收（删了 v3 再发布仍是 v4），否则与已发出的谜题 /
 *    游戏引用对不上。
 * 3. 表名只接受本模块声明的字面量并直接拼进 SQL，不做运行时拼接。
 */
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
