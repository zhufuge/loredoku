import { describe, expect, it } from 'vitest';
import { db } from '../src/db/knex';

/**
 * 迁移的 schema 层验收：迁移本身在 `npm run db:migrate` 时应用（往返由命令行
 * 完成），这里钉住的是**当前表形状**。每一节对应发起它的那个版本，后面的版本
 * 改过形状时，旧断言跟着改（测试只描述现状，不描述履历）。
 */

async function columns(table: string): Promise<string[]> {
  const rows = await db('information_schema.columns')
    .where({ table_name: table, table_schema: 'public' })
    .select('column_name', 'is_nullable');
  return rows.map((row) => row.column_name as string);
}

describe('v0.5.0 migration shape (§11.1)', () => {
  it('adds map_projects.root_id, NOT NULL, backfilled to the row id', async () => {
    const rows = await db('information_schema.columns')
      .where({ table_name: 'maps', column_name: 'root_id', table_schema: 'public' })
      .select('is_nullable');
    expect(rows).toHaveLength(1);
    expect(rows[0].is_nullable).toBe('NO');

    // 回填的契约是「每行都有血缘根」：root_id 不为空，且要么自为根
    // （root_id = id，普通地图），要么指向**另一张已存在的地图**
    // （fork 出来的工作条目，SPEC-K11 Q3 = B）。
    //
    // 早期这里断言「漂移行数为 0」，但那把「用户真的 fork 过一张图」也算成了
    // 失败——库里有手工数据就会误报。改成校验引用完整性。
    const nulls = await db('maps').whereNull('root_id').count('* as c');
    expect(Number(nulls[0]?.c ?? 0)).toBe(0);

    const drifted = (await db('maps')
      .whereRaw("root_id <> id AND version = 'draft'")
      .select('id', 'root_id')) as Array<{ id: number | string; root_id: number | string }>;
    for (const row of drifted) {
      const root = await db('maps').where({ id: row.root_id }).first('id');
      expect(root).toBeDefined();
    }

    // 归组查询走 root_id 索引。
    const index = await db('pg_indexes')
      .where({ tablename: 'maps', indexname: 'maps_root_id_index' })
      .first();
    expect(index).toBeDefined();
  });

});

/**
 * v0.7.1（docs/v0.7.1.md §5.1 / §7.2）：`puzzles` 版本化、`games` 只引用谜题行。
 *
 * 这两条是数据模型的地基，靠代码兜不住 —— 列真的没了、约束真的在，才谈得上
 * 「草稿不能部署」「删掉的 slug 能重用」。
 */
describe('v0.7.1 puzzles versioning shape', () => {
  it('adds the lineage columns and drops the map reference', async () => {
    const cols = await columns('puzzles');
    for (const name of ['root_id', 'version', 'deleted_at', 'cover_path', 'data']) {
      expect(cols).toContain(name);
    }
    // 底图改成自带副本，四列全部退休。
    for (const name of ['map_project_id', 'map_version_no', 'grid_size', 'status']) {
      expect(cols).not.toContain(name);
    }
  });

  it('enforces one live row per version, and a numeric version', async () => {
    const index = await db('pg_indexes')
      .where({ tablename: 'puzzles', indexname: 'uq_puzzles_root_version' })
      .first();
    expect(index?.indexdef).toContain('UNIQUE');
    // 部分索引：软删行不占唯一位（号仍然不回收，那是 MAX 的口径）。
    expect(index?.indexdef).toContain("version <> 'draft'");
    expect(index?.indexdef).toContain('deleted_at IS NULL');

    const check = await db('pg_constraint')
      .where({ conname: 'puzzles_version_format_check' })
      .first();
    expect(check).toBeDefined();
  });

  it('keeps every stored puzzle self-contained (v2 carries the canvas)', async () => {
    const rows = (await db('puzzles').select('id', 'data')) as Array<{
      id: string | number;
      data: {
        version?: number;
        map?: { data?: { gridSize?: number }; mapName?: string };
        characterSlots?: unknown[];
      };
    }>;
    for (const row of rows) {
      expect(row.data.version).toBe(2);
      expect(typeof row.data.map?.data?.gridSize).toBe('number');
      // 名册长度与画布尺寸一致 —— 否则编辑器一打开就对不上格子。
      expect(row.data.characterSlots?.length).toBe(row.data.map?.data?.gridSize);
    }
  });
});

describe('v0.7.1 games reference puzzles shape', () => {
  it('drops the snapshot and the denormalised columns', async () => {
    const cols = await columns('games');
    for (const name of [
      'project_id',
      'version_no',
      'cover_mime',
      'cover_size',
      'cover_width',
      'cover_height',
      'grid_size',
      'snapshot',
    ]) {
      expect(cols).not.toContain(name);
    }
    expect(cols).toContain('deleted_at');
  });

  it('requires a puzzle row and allows only one game per version row', async () => {
    const nullable = await db('information_schema.columns')
      .where({ table_name: 'games', column_name: 'puzzle_id', table_schema: 'public' })
      .select('is_nullable');
    expect(nullable[0]?.is_nullable).toBe('NO');

    const index = await db('pg_indexes')
      .where({ tablename: 'games', indexname: 'games_puzzle_id_unique' })
      .first();
    expect(index?.indexdef).toContain('UNIQUE');
    // 普通唯一索引（不再是 `WHERE puzzle_id IS NOT NULL` 的部分索引）。
    expect(index?.indexdef).not.toContain('WHERE');

    // 版本行挂着游戏时不可删。
    const fk = await db('information_schema.key_column_usage')
      .where({ table_name: 'games', column_name: 'puzzle_id', table_schema: 'public' })
      .select('constraint_name');
    const rules = await db('information_schema.referential_constraints')
      .where({ constraint_name: fk[0].constraint_name as string, constraint_schema: 'public' })
      .select('delete_rule');
    expect(rules.map((row) => row.delete_rule)).toContain('RESTRICT');
  });

  it('makes the access path unique only among live rows', async () => {
    const index = await db('pg_indexes')
      .where({ tablename: 'games', indexname: 'uq_games_slug_active' })
      .first();
    expect(index?.indexdef).toContain('UNIQUE');
    expect(index?.indexdef).toContain('deleted_at IS NULL');

    const full = await db('information_schema.table_constraints')
      .where({ table_name: 'games', table_schema: 'public', constraint_type: 'UNIQUE' })
      .select('constraint_name');
    expect(full.map((row) => row.constraint_name)).not.toContain('games_slug_unique');
  });
});

/**
 * v0.5.1 FEAT-L01 / FEAT-L02（docs/v0.5.1.md §6.1）：迁移 18 给 `assets` 与
 * `characters` 各加一列可空的 `bg_color`。
 *
 * 可空是刻意的 —— 存量行 `NULL` 表示「图片类型」，渲染走原分支，行为逐像素不变
 * （§6.3），所以没有回填、也不需要改任何已存的 JSON。
 */
describe('v0.5.1 colour-block migration (§6.1)', () => {
  // v0.6.1: the colour block moved to `asset_forms` with the rest of the
  // appearance; the column's shape (nullable, `text`, no default) is unchanged.
  it('adds a nullable bg_color to the asset appearance row', async () => {
    const rows = await db('information_schema.columns')
      .where({ table_name: 'asset_forms', column_name: 'bg_color', table_schema: 'public' })
      .select('is_nullable', 'data_type');
    expect(rows).toHaveLength(1);
    expect(rows[0].is_nullable).toBe('YES');
    expect(rows[0].data_type).toBe('text');
  });

  it('adds a nullable bg_color to characters', async () => {
    const rows = await db('information_schema.columns')
      .where({ table_name: 'characters', column_name: 'bg_color', table_schema: 'public' })
      .select('is_nullable', 'data_type');
    expect(rows).toHaveLength(1);
    expect(rows[0].is_nullable).toBe('YES');
    expect(rows[0].data_type).toBe('text');
  });

  it('backfills nothing — the column default is NULL', async () => {
    // The point of "nullable, no backfill" is that pre-v0.5.1 rows stay on the
    // image branch. Asserting a row count would be flaky (other suites — and
    // real usage — legitimately write colours), so check the schema instead.
    for (const table of ['asset_forms', 'characters']) {
      const rows = await db('information_schema.columns')
        .where({ table_name: table, column_name: 'bg_color', table_schema: 'public' })
        .select('column_default');
      expect(rows[0]?.column_default).toBeNull();
    }
  });
});

/**
 * v0.5.2 FEAT-M03 / FEAT-M04（docs/v0.5.2.md §3.1 / §4 / §9.1）：
 * 迁移 19 删掉 `assets.meta` 与 `item_triggers` 表，并把背景资源抬成不阻挡。
 */
describe('v0.5.2 asset slimming migration (§9.1)', () => {
  it('drops assets.meta', async () => {
    const rows = await db('information_schema.columns')
      .where({ table_name: 'assets', column_name: 'meta', table_schema: 'public' })
      .select('column_name');
    expect(rows).toHaveLength(0);
  });

  it('drops the item_triggers table', async () => {
    const rows = await db('information_schema.tables')
      .where({ table_name: 'item_triggers', table_schema: 'public' })
      .select('table_name');
    expect(rows).toHaveLength(0);
  });

  it('keeps characters.meta — only the asset side was slimmed', async () => {
    const rows = await db('information_schema.columns')
      .where({ table_name: 'characters', column_name: 'meta', table_schema: 'public' })
      .select('column_name');
    expect(rows).toHaveLength(1);
  });

  it('leaves no background asset that blocks', async () => {
    const rows = await db('assets')
      .where({ type: 'background', blocking: true })
      .count('* as c');
    expect(Number(rows[0]?.c ?? 0)).toBe(0);
  });
});

/**
 * v0.6.1（docs/v0.6.1.md §7）：资源和形态分家后的形状。
 *
 * 迁移把九列从 `assets` 搬到 `asset_forms`，并给已存的画布锚点补上 `formId`。
 * 这里钉住三件不能靠代码兜底的事：列真的搬走了、每个资源都有形态、画布真的指向形态。
 */
describe('v0.6.1 asset-form migration shape', () => {
  const movedColumns = [
    'width_cells',
    'height_cells',
    'fit_mode',
    'image_path',
    'image_mime',
    'image_size',
    'image_width',
    'image_height',
    'bg_color',
  ];

  it('moves the appearance and footprint columns off assets', async () => {
    const cols = await columns('assets');
    for (const col of movedColumns) {
      expect(cols).not.toContain(col);
    }
    // 身份与行为留下。
    for (const col of ['code', 'name', 'type', 'blocking', 'is_active']) {
      expect(cols).toContain(col);
    }
  });

  it('puts them on asset_forms', async () => {
    const cols = await columns('asset_forms');
    for (const col of [...movedColumns, 'asset_id', 'name', 'sort_order']) {
      expect(cols).toContain(col);
    }
  });

  it('names the form rows after the table, not an older one', async () => {
    const rows = await db('information_schema.columns')
      .where({ table_name: 'asset_forms', table_schema: 'public' })
      .select('column_name');
    const names = rows.map((row) => row.column_name as string);
    expect(names.every((name) => !name.startsWith('items_') && !name.startsWith('cards_'))).toBe(
      true,
    );
  });

  it('leaves every asset with at least one form', async () => {
    const rows = await db('assets')
      .leftJoin('asset_forms', 'asset_forms.asset_id', 'assets.id')
      .whereNull('asset_forms.id')
      .count('* as c');
    expect(Number(rows[0]?.c ?? 0)).toBe(0);
  });

  it('points every stored item anchor at a form, and stamps version 5', async () => {
    const maps = (await db('maps').whereNotNull('data').select('id', 'data')) as Array<{
      data: Record<string, unknown>;
    }>;
    for (const mapRow of maps) {
      const cells = (mapRow.data?.['cells'] ?? {}) as Record<string, Record<string, unknown>>;
      for (const cell of Object.values(cells)) {
        const item = cell['item'] as Record<string, unknown> | undefined;
        if (!item) continue;
        expect(typeof item['formId']).toBe('number');
      }
      // v2 之类更老的画布不在本次改写范围内（它们在上一次迁移里也没被动过），
      // 但凡是被改写的行都必须落到 v5。
      expect(mapRow.data?.['version']).not.toBe(4);
    }
  });
});

/**
 * v0.6.1 续（背景资源也多形态）：背景格同样显式带上自己选的是哪个形态。
 *
 * 表结构没动（`asset_forms` 早就能容纳多个形态），改的只有画布 JSON：补
 * `formId` 并把 version 从 5 推到 6。存量背景资源都只有一个形态，补的就是它。
 */
describe('v0.6.1 background-form migration shape', () => {
  it('points every stored background cell at a form, and stamps version 6', async () => {
    const maps = (await db('maps').whereNotNull('data').select('id', 'data')) as Array<{
      data: Record<string, unknown>;
    }>;
    for (const mapRow of maps) {
      const cells = (mapRow.data?.['cells'] ?? {}) as Record<string, Record<string, unknown>>;
      for (const cell of Object.values(cells)) {
        const background = cell['background'] as Record<string, unknown> | undefined;
        if (!background) continue;
        expect(typeof background['formId']).toBe('number');
      }
      expect(mapRow.data?.['version']).not.toBe(5);
    }
  });
});
