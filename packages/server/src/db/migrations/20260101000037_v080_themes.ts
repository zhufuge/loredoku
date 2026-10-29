import type { Knex } from 'knex';

/**
 * v0.8.0 —— 主题：给四个作品模块划一条边界（docs/v0.8.0.md §3 / §4 / §12）。
 *
 * 三件事必须一起做，否则中途数据不合法：
 *
 *   1. 建 `themes` 并写入两条（默认 + 红楼梦），拿到 id；
 *   2. `assets` / `characters` / `maps` / `puzzles` 加 `theme_id`（**先可空**）→ backfill；
 *   3. 换唯一约束（`assets_code_unique` → `(theme_id, code)`）→ `SET NOT NULL`。
 *
 * 反过来的顺序会得到一个「已 NOT NULL 但还没回填」的表，第二次运行就卡死。
 *
 * **backfill 是一次性的历史归档，不是通用规则。** 现网数据里主题已经靠命名约定
 * （`hlm_` 前缀）维持着：实测 8 个红楼梦谜题引用的资源与角色 100% 是 `hlm_`，
 * 5 个默认谜题 100% 不是。所以：
 *
 *   ① 资源与角色按 `code` 前缀分；
 *   ② 谜题与地图按**引用投票**分（引用到的资源 / 角色全属 `hlm` 且至少有一条 → `hlm`）；
 *   ③ 剩下的全落 `default`。
 *
 * 别让后人以为「主题归属靠前缀推断」—— ② 之后主题由 `theme_id` 列决定，前缀只是这次
 * 迁移的判据。
 */

const THEME_TABLES = ['assets', 'characters', 'maps', 'puzzles'] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    // ---- 1. themes ----
    await trx.schema.createTable('themes', (table) => {
      table.bigIncrements('id').primary();
      table.string('code', 64).notNullable().unique();
      table.string('name', 100).notNullable();
      table.string('description', 500);
      table.jsonb('data').notNullable().defaultTo(trx.raw(`'{}'::jsonb`));
      table.boolean('is_default').notNullable().defaultTo(false);
      table.timestamp('deleted_at', { useTz: true });
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(trx.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(trx.fn.now());
    });
    // 「恰好一个默认主题」，由数据库兜住（§4）。
    await trx.raw(
      'CREATE UNIQUE INDEX themes_default_unique ON themes (is_default) WHERE is_default',
    );

    const inserted = (await trx('themes')
      .insert([
        {
          code: 'default',
          name: '默认',
          description: '无主题归属的历史内容',
          is_default: true,
        },
        {
          code: 'hlm',
          name: '红楼梦',
          description: '红楼梦主题：大观园里的人与物',
          is_default: false,
        },
      ])
      .returning(['id', 'code'])) as Array<{ id: string | number; code: string }>;
    const themeIdByCode = new Map(inserted.map((row) => [row.code, Number(row.id)]));
    const defaultId = themeIdByCode.get('default');
    const hlmId = themeIdByCode.get('hlm');
    if (defaultId === undefined || hlmId === undefined) {
      throw new Error('v0.8.0 迁移：themes 种子行没有写进去');
    }

    // ---- 2. 加列（先可空） ----
    for (const table of THEME_TABLES) {
      await trx.schema.alterTable(table, (t) => {
        t.bigInteger('theme_id').nullable().references('id').inTable('themes').onDelete('RESTRICT');
      });
    }

    // ---- 3. backfill ①：资源与角色按 code 前缀 ----
    for (const table of ['assets', 'characters'] as const) {
      await trx(table).whereRaw("code LIKE 'hlm\\_%'").update({ theme_id: hlmId });
      await trx(table).whereNull('theme_id').update({ theme_id: defaultId });
    }

    // ---- 3. backfill ②：谜题与地图按引用投票 ----
    const assetTheme = await themeMap(trx, 'assets');
    const characterTheme = await themeMap(trx, 'characters');

    const mapRows = (await trx('maps').select('id', 'root_id', 'theme_id', 'data')) as Array<{
      id: string | number;
      root_id: string | number;
      theme_id: string | number | null;
      data: unknown;
    }>;
    for (const row of mapRows) {
      const themeId = voteTheme(
        [cellAssetIds(row.data), []],
        assetTheme,
        characterTheme,
        defaultId,
        hlmId,
      );
      await trx('maps').where({ id: row.id }).update({ theme_id: themeId });
    }

    const puzzleRows = (await trx('puzzles').select('id', 'root_id', 'data')) as Array<{
      id: string | number;
      root_id: string | number;
      data: unknown;
    }>;
    for (const row of puzzleRows) {
      const snapshot = puzzleCanvas(row.data);
      const themeId = voteTheme(
        [cellAssetIds(snapshot?.canvas), slotCharacterIds(snapshot?.puzzle)],
        assetTheme,
        characterTheme,
        defaultId,
        hlmId,
      );
      await trx('puzzles').where({ id: row.id }).update({ theme_id: themeId });
    }

    // ---- 3. 断言：同一血统的行必须同主题 ----
    // 宁可让迁移失败，也不要产出一个「同一张图的草稿与版本分属两个主题」的自相矛盾血统。
    for (const table of ['maps', 'puzzles'] as const) {
      const bad = (await trx(table)
        .select('root_id')
        .groupBy('root_id')
        .havingRaw('count(DISTINCT theme_id) > 1')) as Array<{ root_id: string | number }>;
      if (bad.length > 0) {
        throw new Error(
          `v0.8.0 迁移：${table} 有 ${bad.length} 个血统被分到了不同主题（root_id=${bad
            .slice(0, 5)
            .map((row) => String(row.root_id))
            .join(', ')}），请人工核对后再跑`,
        );
      }
    }

    // ---- 4. 唯一约束：全局 → 主题内，然后 SET NOT NULL ----
    await swapCodeUnique(trx, 'assets', 'assets_code_unique');
    await swapCodeUnique(trx, 'characters', 'characters_code_unique');
    for (const table of THEME_TABLES) {
      await trx.raw(`ALTER TABLE ${table} ALTER COLUMN theme_id SET NOT NULL`);
      await trx.raw(`CREATE INDEX idx_${table}_theme ON ${table} (theme_id)`);
    }

    // ---- 5. 主题合辑（§9）：目录 + 成员，成员挂 puzzle_id ----
    await trx.schema.createTable('theme_deployments', (table) => {
      table.bigIncrements('id').primary();
      table
        .bigInteger('theme_id')
        .notNullable()
        .references('id')
        .inTable('themes')
        .onDelete('RESTRICT');
      table.string('slug', 64).notNullable().unique();
      table.string('name', 100).notNullable();
      table.string('description', 500);
      table.text('cover_path');
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(trx.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(trx.fn.now());
    });
    await trx.schema.createTable('theme_deployment_puzzles', (table) => {
      table
        .bigInteger('deployment_id')
        .notNullable()
        .references('id')
        .inTable('theme_deployments')
        .onDelete('CASCADE');
      // 挂 puzzle_id 而不是 game_id：`upsertGame` 是 delete-then-insert，
      // 重新部署一次 game id 就变了，挂 game id 的成员会全部悬空（§9）。
      table
        .bigInteger('puzzle_id')
        .notNullable()
        .references('id')
        .inTable('puzzles')
        .onDelete('CASCADE');
      table.integer('sort_order').notNullable().defaultTo(0);
      table.primary(['deployment_id', 'puzzle_id']);
    });
    await trx.raw(
      'CREATE INDEX idx_theme_deployment_puzzles_puzzle ON theme_deployment_puzzles (puzzle_id)',
    );
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    await trx.schema.dropTableIfExists('theme_deployment_puzzles');
    await trx.schema.dropTableIfExists('theme_deployments');

    // 全局唯一可能已经被「第二个主题里同名的 code」用过，回滚不能因此失败：
    // 先把撞车的行改个名（只可能是本版之后新建的数据）。
    await dedupeCrossThemeCodes(trx, 'assets');
    await dedupeCrossThemeCodes(trx, 'characters');

    await trx.raw('ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_theme_code_unique');
    await trx.raw('ALTER TABLE assets ADD CONSTRAINT assets_code_unique UNIQUE (code)');
    await trx.raw('ALTER TABLE characters DROP CONSTRAINT IF EXISTS characters_theme_code_unique');
    await trx.raw('ALTER TABLE characters ADD CONSTRAINT characters_code_unique UNIQUE (code)');

    for (const table of THEME_TABLES) {
      await trx.raw(`DROP INDEX IF EXISTS idx_${table}_theme`);
      await trx.schema.alterTable(table, (t) => {
        t.dropColumn('theme_id');
      });
    }
    await trx.schema.dropTableIfExists('themes');
  });
}

/** `code → theme_id`，用于引用投票。 */
async function themeMap(
  trx: Knex.Transaction,
  table: 'assets' | 'characters',
): Promise<Map<number, number>> {
  const rows = (await trx(table).select('id', 'theme_id')) as Array<{
    id: string | number;
    theme_id: string | number;
  }>;
  return new Map(rows.map((row) => [Number(row.id), Number(row.theme_id)]));
}

interface PuzzleCanvasSnapshot {
  canvas: unknown;
  puzzle: unknown;
}

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

/**
 * `PuzzleDraft` 的形状随版本漂移过（旧草稿的 placement 字段名不同），但
 * 「`data.map.data` 是画布、`data.characterSlots` 是名册」从 v0.7.1 起没变。
 * 读不动的行一律当「没有引用」——它会被投到 `default`，不会丢数据。
 */
function puzzleCanvas(raw: unknown): PuzzleCanvasSnapshot | null {
  const record = asRecord(raw);
  const map = asRecord(record?.['map']);
  if (!record || !map) return null;
  return { canvas: map['data'], puzzle: record };
}

function cellAssetIds(canvas: unknown): number[] {
  const record = asRecord(canvas);
  const cells = asRecord(record?.['cells']);
  if (!cells) return [];
  const ids: number[] = [];
  for (const value of Object.values(cells)) {
    const cell = asRecord(value);
    for (const layer of ['background', 'item'] as const) {
      const ref = asRecord(cell?.[layer]);
      const assetId = ref?.['assetId'];
      if (typeof assetId === 'number') ids.push(assetId);
    }
  }
  return ids;
}

function slotCharacterIds(puzzle: unknown): number[] {
  const record = asRecord(puzzle);
  const slots = record?.['characterSlots'];
  if (!Array.isArray(slots)) return [];
  const ids: number[] = [];
  for (const slot of slots) {
    const entry = asRecord(slot);
    const characterId = entry?.['characterId'];
    if (typeof characterId === 'number') ids.push(characterId);
  }
  return ids;
}

/**
 * 引用投票：引用的资源与角色**全部**属于 `hlm` 且至少有一条 → `hlm`，其余 → `default`。
 * 混合归属的行也落 `default` —— 宁可把一关留在大池子里，也不要把它关进一个它并不全属的主题。
 */
function voteTheme(
  groups: [number[], number[]],
  assetTheme: Map<number, number>,
  characterTheme: Map<number, number>,
  defaultId: number,
  hlmId: number,
): number {
  const [assetIds, characterIds] = groups;
  const owners = new Set<number>();
  for (const id of assetIds) {
    const owner = assetTheme.get(id);
    if (owner !== undefined) owners.add(owner);
  }
  for (const id of characterIds) {
    const owner = characterTheme.get(id);
    if (owner !== undefined) owners.add(owner);
  }
  if (owners.size === 1 && owners.has(hlmId)) return hlmId;
  return defaultId;
}

async function swapCodeUnique(
  trx: Knex.Transaction,
  table: 'assets' | 'characters',
  constraintName: string,
): Promise<void> {
  // `table.unique(…)` 建的是 UNIQUE **约束**，回滚必须 `dropUnique`；
  // 这里同样用 raw 保持与既有迁移一致的写法。
  await trx.raw(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${constraintName}`);
  await trx.raw(
    `ALTER TABLE ${table} ADD CONSTRAINT ${table}_theme_code_unique UNIQUE (theme_id, code)`,
  );
}

/** 回滚前把「同名 code 散在不同主题」的行改成 `code_2` / `code_3`，保证全局唯一能建上。 */
async function dedupeCrossThemeCodes(
  trx: Knex.Transaction,
  table: 'assets' | 'characters',
): Promise<void> {
  const rows = (await trx(table).select('id', 'code', 'theme_id').orderBy('theme_id')) as Array<{
    id: string | number;
    code: string;
    theme_id: string | number;
  }>;
  const seen = new Map<string, number>();
  for (const row of rows) {
    const count = seen.get(row.code) ?? 0;
    seen.set(row.code, count + 1);
    if (count === 0) continue;
    await trx(table)
      .where({ id: row.id })
      .update({ code: `${row.code}_${count + 1}` });
  }
}
