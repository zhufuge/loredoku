import type { Knex } from 'knex';
import { db } from '../db/knex';
import type {
  Theme,
  ThemeCounts,
  ThemeData,
  ThemeOption,
  ThemeRow,
} from '@loredoku/shared';
import { THEME_DATA_VERSION } from '@loredoku/shared';

/** v0.8.0（docs/v0.8.0.md §4 / §19）：主题的读写。 这一层只做 SQL。**`theme_id` 到此为止** —— 接口、资源包、前端地址用的都是 `code`（§19），数字主键只在 `theme_id` 外键列与服务端内部事务里流通。 §19 删掉了 `is_default`：没有「默认主题」这个落点，也没有「恰好一个」的约束。 主题只是一个容器，容器的先后按创建顺序（`id`）排。 */

function toData(raw: unknown): ThemeData {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { version: THEME_DATA_VERSION };
  }
  const record = raw as Record<string, unknown>;
  const version = typeof record['version'] === 'number' ? record['version'] : THEME_DATA_VERSION;
  return { ...(record as unknown as ThemeData), version };
}

function toOption(row: ThemeRow): ThemeOption {
  return { code: row.code, name: row.name };
}

export function toTheme(row: ThemeRow, counts: ThemeCounts): Theme {
  return {
    code: row.code,
    name: row.name,
    description: row.description,
    data: toData(row.data),
    counts,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function listThemeRows(): Promise<ThemeRow[]> {
  return (await db<ThemeRow>('themes')
    // 按创建顺序。§19 之前这里靠 `is_default` 把默认主题顶到第一位 —— 那让列表
    // 顺序承载了一个语义（「这行特殊」），删掉语义之后顺序就只是顺序。
    .orderBy('id', 'asc')) as ThemeRow[];
}

export async function listThemeOptions(): Promise<ThemeOption[]> {
  return (await listThemeRows()).map(toOption);
}

export async function findById(id: number): Promise<ThemeRow | undefined> {
  return db<ThemeRow>('themes').where({ id }).first();
}

export async function findByCode(code: string): Promise<ThemeRow | undefined> {
  return db<ThemeRow>('themes').where({ code }).first();
}

/** 编码 → 主键（§19）：接口只认编码，进到写库那一刻才换成 `theme_id`。 */
export async function idOfCode(code: string): Promise<number | undefined> {
  const row = await findByCode(code);
  return row ? Number(row.id) : undefined;
}

export async function createTheme(data: {
  code: string;
  name: string;
  description: string | null;
  data: ThemeData;
}): Promise<number> {
  const [row] = (await db('themes')
    .insert({
      code: data.code,
      name: data.name,
      description: data.description,
      data: data.data,
    })
    .returning('id')) as Array<{ id: string | number }>;
  return Number(row!.id);
}

export async function updateTheme(
  id: number,
  patch: { name?: string; description?: string | null; data?: ThemeData },
): Promise<boolean> {
  const next: Record<string, unknown> = { updated_at: db.fn.now() };
  if (patch.name !== undefined) next['name'] = patch.name;
  if (patch.description !== undefined) next['description'] = patch.description;
  if (patch.data !== undefined) next['data'] = patch.data;
  const affected = await db('themes').where({ id }).update(next);
  return affected > 0;
}

/** 删主题 = 物理删除（docs/v0.8.3.md §15）：`theme_id` 全是 RESTRICT，删前必须清引用；
 *  软删会让 `themes.code` 的 UNIQUE 被尸体行永久占用。顺手清已软删的子行，活着的子行仍让外键报错。 */
export async function deleteTheme(id: number): Promise<boolean> {
  return db.transaction(async (trx) => {
    const zombiePuzzles = (await trx('puzzles')
      .where({ theme_id: id })
      .whereNotNull('deleted_at')
      .pluck('id')) as number[];
    if (zombiePuzzles.length > 0) {
      // `games.puzzle_id` 是 RESTRICT，游戏行（含已取消部署的）得先走。
      await trx('games').whereIn('puzzle_id', zombiePuzzles).del();
      await trx('puzzles').whereIn('id', zombiePuzzles).del();
    }
    await trx('maps').where({ theme_id: id }).whereNotNull('deleted_at').del();
    const affected = await trx('themes').where({ id }).del();
    return affected > 0;
  });
}

/** 主题卡片五项计数：地图与谜题数血统（`root_id`）不数行数，否则一发布数字就跳。
 *  地图/谜题/游戏走软删必须过滤 `deleted_at`（否则 `deleteTheme` 的护栏会把人锁死）；资源/角色无 deleted_at 不过滤。 */
export async function countsByTheme(): Promise<Map<number, ThemeCounts>> {
  const result = new Map<number, ThemeCounts>();
  const empty = (): ThemeCounts => ({ assets: 0, maps: 0, characters: 0, puzzles: 0, games: 0 });

  const [assets, characters, maps, puzzles] = await Promise.all([
    db('assets').select('theme_id').count({ n: '*' }).groupBy('theme_id'),
    db('characters').select('theme_id').count({ n: '*' }).groupBy('theme_id'),
    db('maps').whereNull('deleted_at').select('theme_id').countDistinct('root_id as n').groupBy('theme_id'),
    db('puzzles').whereNull('deleted_at').select('theme_id').countDistinct('root_id as n').groupBy('theme_id'),
  ]);

  const put = (key: keyof ThemeCounts, list: Array<Record<string, unknown>>): void => {    for (const row of list) {
      const id = Number(row['theme_id']);
      const entry = result.get(id) ?? empty();
      entry[key] = Number(row['n'] ?? 0);
      result.set(id, entry);
    }
  };
  put('assets', assets as never);
  put('characters', characters as never);
  put('maps', maps as never);
  put('puzzles', puzzles as never);

  // 已上线 = games 活跃行 join 到谜题的 theme_id（`games` 自己不存 theme，§3.1）。
  const games = await db('games')
    .join('puzzles', 'puzzles.id', 'games.puzzle_id')
    .whereNull('games.deleted_at')
    .select('puzzles.theme_id as theme_id')
    .count({ n: '*' })
    .groupBy('puzzles.theme_id');
  put('games', games as never);
  return result;
}

export function emptyCounts(): ThemeCounts {
  return { assets: 0, maps: 0, characters: 0, puzzles: 0, games: 0 };
}

/** 引用体检与打包都要知道「这条引用属于哪个主题」。 */
export async function themeIdsOf(
  kind: 'asset' | 'variant' | 'character',
  ids: number[],
): Promise<Map<number, number>> {
  if (ids.length === 0) return new Map();
  if (kind === 'variant') {
    const rows = (await db('asset_variants')
      .join('assets', 'assets.id', 'asset_variants.asset_id')
      .whereIn('asset_variants.id', ids)
      .select('asset_variants.id as id', 'assets.theme_id as theme_id')) as Array<{
      id: string | number;
      theme_id: string | number;
    }>;
    return new Map(rows.map((row) => [Number(row.id), Number(row.theme_id)]));
  }
  const table = kind === 'asset' ? 'assets' : 'characters';
  const rows = (await db(table)
    .whereIn('id', ids)
    .select('id', 'theme_id')) as Array<{ id: string | number; theme_id: string | number }>;
  return new Map(rows.map((row) => [Number(row.id), Number(row.theme_id)]));
}

/** 体检报错要把 id 翻成人名；不存在的 id 不在返回里，调用方自己兜底成 `#id`。 */
export async function namesByIds(
  table: 'assets' | 'characters',
  ids: number[],
): Promise<Array<{ id: string | number; name: string }>> {
  if (ids.length === 0) return [];
  return (await db(table).whereIn('id', ids).select('id', 'name')) as Array<{
    id: string | number;
    name: string;
  }>;
}

/** 引用体检要把「另一个世界」说成名字，而那一层手里只有 `theme_id`。
 *  返回的是 `{code,name}` 而不是名字：错报要在**地址里**指得过去（§19）。 */
export async function themesByIds(
  ids: number[],
): Promise<Map<number, { code: string; name: string }>> {
  if (ids.length === 0) return new Map();
  const rows = (await db('themes').whereIn('id', ids).select('id', 'code', 'name')) as Array<{
    id: string | number;
    code: string;
    name: string;
  }>;
  return new Map(rows.map((row) => [Number(row.id), { code: row.code, name: row.name }]));
}

/** 事务句柄直接给 `db`：调用方要的多是「几条写一起提交」，这里不另开一层。 */
export function tx(): Knex {
  return db;
}
