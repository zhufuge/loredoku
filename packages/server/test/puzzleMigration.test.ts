import { describe, expect, it } from 'vitest';
import { db } from '../src/db/knex';

/**
 * v0.5.0（docs/v0.5.0.md §13.2 / §11.1）：两个迁移的 schema 层验收。
 *
 * 迁移本身在 `npm run db:migrate` 时应用（§13.4 的往返由命令行完成），这里钉住
 * 的是**应用后的形状**：
 *
 * - `map_projects.root_id` 存在、NOT NULL、存量行全部等于自身 id（Q3 = B 的
 *   「普通地图的血缘根恒等于自己的 id」）；
 * - `puzzles` 表存在，`map_project_id` 外键 RESTRICT（删地图前必须先删谜题）；
 * - `map_games.puzzle_id` 列 + **部分**唯一索引（NULL 行不受限，存量游戏可多条）；
 * - `map_games.project_id` 的旧 UNIQUE 约束已删（同一地图的不同版本可同时被部署）。
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
      .where({ table_name: 'map_projects', column_name: 'root_id', table_schema: 'public' })
      .select('is_nullable');
    expect(rows).toHaveLength(1);
    expect(rows[0].is_nullable).toBe('NO');

    // 存量行（含测试留下的）必须满足 root_id = id —— 普通地图自为血缘根。
    const drifted = await db('map_projects').whereRaw('root_id <> id').count('* as c');
    expect(Number(drifted[0]?.c ?? 0)).toBe(0);

    const nulls = await db('map_projects').whereNull('root_id').count('* as c');
    expect(Number(nulls[0]?.c ?? 0)).toBe(0);

    // 归组查询走 root_id 索引。
    const index = await db('pg_indexes')
      .where({ tablename: 'map_projects', indexname: 'map_projects_root_id_index' })
      .first();
    expect(index).toBeDefined();
  });

  it('creates the puzzles table with a RESTRICT foreign key', async () => {
    const cols = await columns('puzzles');
    for (const name of [
      'id',
      'name',
      'description',
      'map_project_id',
      'map_version_no',
      'grid_size',
      'data',
      'status',
      'created_at',
      'updated_at',
    ]) {
      expect(cols).toContain(name);
    }

    // map_project_id 是 puzzles 的外键列。
    const fk = await db('information_schema.key_column_usage')
      .where({ table_name: 'puzzles', column_name: 'map_project_id', table_schema: 'public' })
      .select('constraint_name');
    expect(fk).toHaveLength(1);

    // ON DELETE RESTRICT：删地图不会级联删谜题（迁移注释里的约定）。
    const deleteRule = await db('information_schema.referential_constraints')
      .where({ constraint_name: fk[0].constraint_name as string, constraint_schema: 'public' })
      .select('delete_rule');
    expect(deleteRule.map((row) => row.delete_rule)).toContain('RESTRICT');
  });

  it('adds map_games.puzzle_id with a partial unique index (CONS-K16)', async () => {
    const cols = await columns('map_games');
    expect(cols).toContain('puzzle_id');

    const index = await db('pg_indexes')
      .where({ tablename: 'map_games', indexname: 'map_games_puzzle_id_unique' })
      .first();
    expect(index).toBeDefined();
    // 部分索引：只约束 puzzle_id IS NOT NULL 的行。
    expect(index?.indexdef).toContain('WHERE (puzzle_id IS NOT NULL)');
    expect(index?.indexdef).toContain('UNIQUE');

    // 删除规则是 SET NULL：删谜题只把游戏降级成存量游戏。
    const fk = await db('information_schema.key_column_usage')
      .where({ table_name: 'map_games', column_name: 'puzzle_id', table_schema: 'public' })
      .select('constraint_name');
    expect(fk).toHaveLength(1);
    const rules = await db('information_schema.referential_constraints')
      .where({ constraint_name: fk[0].constraint_name as string, constraint_schema: 'public' })
      .select('delete_rule');
    expect(rules.map((row) => row.delete_rule)).toContain('SET NULL');
  });

  it('drops the old map_games.project_id UNIQUE constraint', async () => {
    const unique = await db('information_schema.table_constraints')
      .where({
        table_name: 'map_games',
        constraint_type: 'UNIQUE',
        table_schema: 'public',
      })
      .select('constraint_name');
    expect(unique.map((row) => row.constraint_name)).not.toContain('map_games_project_id_unique');

    // 但 project_id 列本身还在（它仍然表示被引用的地图版本）。
    const cols = await columns('map_games');
    expect(cols).toContain('project_id');
    expect(cols).toContain('version_no');
  });
});

/**
 * v0.5.1 FEAT-L01 / FEAT-L02（docs/v0.5.1.md §6.1）：迁移 18 给 `items` 与
 * `characters` 各加一列可空的 `bg_color`。
 *
 * 可空是刻意的 —— 存量行 `NULL` 表示「图片类型」，渲染走原分支，行为逐像素不变
 * （§6.3），所以没有回填、也不需要改任何已存的 JSON。
 */
describe('v0.5.1 colour-block migration (§6.1)', () => {
  it('adds a nullable bg_color to items', async () => {
    const rows = await db('information_schema.columns')
      .where({ table_name: 'items', column_name: 'bg_color', table_schema: 'public' })
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

  it('leaves every existing row on the image branch', async () => {
    const itemNulls = await db('items').whereNotNull('bg_color').count('* as c');
    const charNulls = await db('characters').whereNotNull('bg_color').count('* as c');
    // Only rows written by this suite's colour-block tests may carry a colour,
    // and those are cleaned up — so a bare run sees none.
    expect(Number(itemNulls[0]?.c ?? 0)).toBe(0);
    expect(Number(charNulls[0]?.c ?? 0)).toBe(0);
  });
});
