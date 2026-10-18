import type { Knex } from 'knex';

/**
 * v0.5.8 第三阶段（二）—— `map_versions` 合并进 `maps`
 * 设计：docs/map-table-merge-design.md（§3 目标结构 / §6 数据迁移 / §9 谜题边界）
 *
 * 合并后的模型：
 *
 * - 一行 `maps` = 一个地图条目。`version = 'draft'` 是工作条目（活草稿），
 *   `version` 为纯数字字符串是已发布版本（冻结快照）。
 * - `draft_data` 改名 `data`：合并后每行都有 data，`draft_` 前缀失去意义。
 * - 删 `status` / `current_version_no`：`version` 已表达同一信息，版本号改推导
 *   （`MAX(CAST(version AS int))`，含软删行，API 字段名保留）。
 * - 版本删除 = 软删（`deleted_at`）：界面不展示、DB 保留、号仍占 MAX 不回收。
 *   草稿删除 = 硬删，不牵连版本 —— 两者删除语义不相邻，所以不需要归属列。
 *
 * `puzzles.map_project_id` / `games.project_id` 在 up 里改指**版本行 id**
 * （§9）：合并前版本在另一张表，FK 只能指向容器（工作条目），这正是「删工作
 * 条目被 RESTRICT 拦下」的根因；合并后版本行自己就是 maps 行。down 回填成
 * 同血统的草稿行 id（近似，旧模型只能表达容器）。
 */
export async function up(knex: Knex): Promise<void> {
  // 1. 列改造：draft_data → data，加 version / deleted_at
  await knex.raw('ALTER TABLE maps RENAME COLUMN draft_data TO data');
  await knex.raw("ALTER TABLE maps ADD COLUMN version text NOT NULL DEFAULT 'draft'");
  await knex.raw('ALTER TABLE maps ADD COLUMN deleted_at timestamptz');

  // 2. 冲突预检：版本行要保留原 id，和现有 maps id 撞了就搬不了
  const overlap = await knex.raw(
    'SELECT count(*)::int AS n FROM maps m JOIN map_versions v ON m.id = v.id',
  );
  const collisions = Number((overlap.rows[0] as { n: number }).n);
  if (collisions > 0) {
    throw new Error(
      `无法合并 map_versions：有 ${collisions} 行的 id 与 maps 现有行冲突（设计要求保留版本行 id）`,
    );
  }

  // 3. 搬运版本行（保留 id）。name / description / cover 从此刻起是真实快照。
  await knex.raw(`
    INSERT INTO maps (id, root_id, name, description, cover_path, data,
                      version, deleted_at, draft_updated_at, created_at, updated_at)
    SELECT v.id, p.root_id, p.name, p.description, p.cover_path, v.data,
           v.version_no::text, NULL,
           v.snapshot_created_at, v.snapshot_created_at, v.snapshot_created_at
    FROM map_versions v
    JOIN maps p ON p.id = v.project_id
  `);

  // 4. 谜题 / 游戏改指版本行 id —— 必须在 DROP TABLE map_versions 之前。
  //    （找不到对应版本行的历史数据保持原值不动：指向草稿行依旧合法。）
  await knex.raw(`
    UPDATE puzzles p
    SET map_project_id = v.id
    FROM map_versions v
    WHERE v.project_id = p.map_project_id AND v.version_no = p.map_version_no
  `);
  await knex.raw(`
    UPDATE games g
    SET project_id = v.id
    FROM map_versions v
    WHERE v.project_id = g.project_id AND v.version_no = g.version_no
  `);

  // 5. 序列推到两张表 id 的最大值之上，否则后续插入撞 PK
  await knex.raw(`
    SELECT setval('map_projects_id_seq',
                  GREATEST((SELECT COALESCE(MAX(id), 0) FROM maps),
                           (SELECT COALESCE(MAX(id), 0) FROM map_versions), 1))
  `);

  // 6. 约束：号不可复用（软删行仍占 MAX），但行可忽略（不占唯一位）
  await knex.raw(`
    CREATE UNIQUE INDEX uq_maps_root_version ON maps (root_id, version)
    WHERE version <> 'draft' AND deleted_at IS NULL
  `);
  await knex.raw(`
    ALTER TABLE maps ADD CONSTRAINT maps_version_format_check
    CHECK (version = 'draft' OR version ~ '^\\d+$')
  `);
  await knex.raw(`
    ALTER TABLE maps ADD CONSTRAINT maps_version_data_check
    CHECK (version = 'draft' OR data IS NOT NULL)
  `);
  await knex.raw('CREATE INDEX maps_deleted_at_created_at_index ON maps (deleted_at, created_at)');

  // 7. 收尾：删旧列、删旧表。map_versions_id_seq 一般随表列一起消失，这里兜个底。
  await knex.raw('ALTER TABLE maps DROP COLUMN status');
  await knex.raw('ALTER TABLE maps DROP COLUMN current_version_no');
  await knex.raw('DROP TABLE map_versions');
  await knex.raw('DROP SEQUENCE IF EXISTS map_versions_id_seq');
}

/**
 * down 是**结构可逆、归属近似**：
 *
 * - `map_versions.project_id` 只能填同血统下任一活草稿行 id（fork 过就取最早
 *   创建的）；血统里已无草稿行（工作条目被硬删过）时，从最早的版本行**造一条**
 *   草稿行当容器 —— 旧模型里版本必须有归属，rollback 无法凭空表达「无主版本」。
 * - `status` / `current_version_no` 由该行掌管的版本号推导，值有损（旧列只记录
 *   发布时刻，合并后只能近似还原到「同血统最早草稿行」上）。
 */
export async function down(knex: Knex): Promise<void> {
  // 1. 重建 map_versions（此时 maps 还带着 version / data，便于回填）
  await knex.schema.createTable('map_versions', (table) => {
    table.bigIncrements('id').primary();
    table
      .bigInteger('project_id')
      .notNullable()
      .references('id')
      .inTable('maps')
      .onUpdate('CASCADE')
      .onDelete('CASCADE');
    table.integer('version_no').notNullable();
    table.jsonb('data').notNullable();
    table.timestamp('snapshot_created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.unique(['project_id', 'version_no'], { indexName: 'uq_map_versions_project_no' });
  });

  // 2. 无主血统（版本还在、草稿行已硬删）先补一条草稿行当容器
  await knex.raw(`
    INSERT INTO maps (root_id, name, description, cover_path, data, draft_updated_at)
    SELECT v.root_id, v.name, v.description, v.cover_path, v.data, v.created_at
    FROM maps v
    WHERE v.version <> 'draft'
      AND v.id = (SELECT min(x.id) FROM maps x
                  WHERE x.root_id = v.root_id AND x.version <> 'draft')
      AND NOT EXISTS (SELECT 1 FROM maps d
                      WHERE d.root_id = v.root_id AND d.version = 'draft')
  `);

  // 3. 版本行搬回 map_versions
  await knex.raw(`
    INSERT INTO map_versions (id, project_id, version_no, data, snapshot_created_at)
    SELECT v.id, o.id, v.version::int, v.data, v.created_at
    FROM maps v
    JOIN LATERAL (
      SELECT d.id FROM maps d
      WHERE d.root_id = v.root_id AND d.version = 'draft'
      ORDER BY d.created_at, d.id LIMIT 1
    ) o ON true
    WHERE v.version <> 'draft'
  `);

  // 4. 谜题 / 游戏归属改回容器（草稿行）id
  await knex.raw(`
    UPDATE puzzles p
    SET map_project_id = o.id
    FROM maps v
    JOIN LATERAL (
      SELECT d.id FROM maps d
      WHERE d.root_id = v.root_id AND d.version = 'draft'
      ORDER BY d.created_at, d.id LIMIT 1
    ) o ON true
    WHERE p.map_project_id = v.id AND v.version <> 'draft'
  `);
  await knex.raw(`
    UPDATE games g
    SET project_id = o.id
    FROM maps v
    JOIN LATERAL (
      SELECT d.id FROM maps d
      WHERE d.root_id = v.root_id AND d.version = 'draft'
      ORDER BY d.created_at, d.id LIMIT 1
    ) o ON true
    WHERE g.project_id = v.id AND v.version <> 'draft'
  `);

  // 5. 版本行离开 maps。此时 puzzles / games 已全部指向草稿行，RESTRICT 不会触发。
  await knex.raw("DELETE FROM maps WHERE version <> 'draft'");

  // 6. 列回退：加回 status / current_version_no 并按掌管的版本号推导回填。
  //    按 `map_versions.project_id`（= 同血统最早草稿行）逐行推导：旧模型里号只
  //    落在「发布过的那一行」上，逐行推导与之一致；血统级推导会给没发布过的 fork
  //    草稿也盖上版本号。
  await knex.raw("ALTER TABLE maps ADD COLUMN status varchar NOT NULL DEFAULT 'draft'");
  await knex.raw('ALTER TABLE maps ADD COLUMN current_version_no integer');
  await knex.raw(`
    UPDATE maps m
    SET current_version_no = sub.max_no
    FROM (
      SELECT project_id, MAX(version_no)::int AS max_no
      FROM map_versions
      GROUP BY project_id
    ) sub
    WHERE sub.project_id = m.id
  `);
  await knex.raw("UPDATE maps SET status = 'published' WHERE current_version_no IS NOT NULL");

  // 7. 删合并期新增的列与约束（CHECK / 索引随列自动消失），data 改名回 draft_data
  await knex.raw('ALTER TABLE maps DROP COLUMN version');
  await knex.raw('ALTER TABLE maps DROP COLUMN deleted_at');
  await knex.raw('ALTER TABLE maps RENAME COLUMN data TO draft_data');

  await knex.raw(`
    SELECT setval('map_versions_id_seq',
                  GREATEST((SELECT COALESCE(MAX(id), 0) FROM map_versions), 1))
  `);
}
