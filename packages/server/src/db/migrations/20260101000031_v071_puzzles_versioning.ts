import type { Knex } from 'knex';
import { GRID_SIZE_MAX, GRID_SIZE_MIN } from '@loredoku/shared';
import {
  buildPuzzleDraftV2,
  puzzleDraftToLegacy,
  type PuzzleCanvasSource,
} from '../../service/puzzleDraftMigration';

/**
 * v0.7.1 §5.4 —— `puzzles` 版本化，并把底图从「引用」改成「自带副本」。
 *
 * 单事务内的四步：
 *
 * 1. 加 `root_id` / `version` / `deleted_at` / `cover_path`；存量行 `root_id = id`。
 * 2. 逐行把 `data.map` 从 v1 的 `{ mapId, versionNo, gridSize }` 换成 v2 的
 *    `{ mapId, versionNo, mapName, data }`：`data` 取原 `map_project_id` 指向的
 *    **地图版本行**的画布（过 `absorbLegacyMapDraft` 升到当前 JSON 版本）。
 *    引用的版本行已被硬删的历史脏数据给一份空画布 —— schema 合法、名册长度
 *    不变，编辑器能打开。
 * 3. 建四个索引 / 约束（与 `maps` 一一对应）。
 * 4. 删 `map_project_id` / `map_version_no` / `grid_size` / `status`。
 *
 * `down()` **完全可逆**：来源信息留在 JSON 里（`data.map.mapId` /
 * `versionNo` + `data.map.data.gridSize`），能拆回 v1 形状并回填四列。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE puzzles ADD COLUMN root_id bigint');
  await knex.raw("ALTER TABLE puzzles ADD COLUMN version text NOT NULL DEFAULT 'draft'");
  await knex.raw('ALTER TABLE puzzles ADD COLUMN deleted_at timestamptz');
  await knex.raw('ALTER TABLE puzzles ADD COLUMN cover_path text');
  await knex.raw('UPDATE puzzles SET root_id = id WHERE root_id IS NULL');
  await knex.raw('ALTER TABLE puzzles ALTER COLUMN root_id SET NOT NULL');

  // ---- 画布回填：逐行走 JS，因为要把旧画布 JSON 升到当前版本 ----
  const rows = (await knex('puzzles').select(
    'id',
    'data',
    'grid_size',
    'map_project_id',
    'map_version_no',
  )) as Array<{
    id: string | number;
    data: unknown;
    grid_size: number;
    map_project_id: string | number;
    map_version_no: number;
  }>;

  for (const row of rows) {
    const mapId = Number(row.map_project_id);
    // 合并后 `map_project_id` 已经指向 `maps` 里的**版本行**，按 id 取即可。
    const source = (await knex('maps').where({ id: mapId }).first()) as
      | { name: string; data: unknown }
      | undefined;

    const canvas: PuzzleCanvasSource = {
      mapId,
      versionNo: Number(row.map_version_no),
      mapName: source?.name ?? '',
      // 引用失效（版本行已硬删）→ 空画布兜底。
      data: source?.data ?? null,
    };
    const v2 = buildPuzzleDraftV2(row.data, canvas, Number(row.grid_size));
    if (!v2) continue;
    await knex('puzzles').where({ id: row.id }).update({ data: v2 });
  }

  // ---- 约束与索引（与 maps 一一对应） ----
  await knex.raw(`
    CREATE UNIQUE INDEX uq_puzzles_root_version ON puzzles (root_id, version)
    WHERE version <> 'draft' AND deleted_at IS NULL
  `);
  await knex.raw(`
    ALTER TABLE puzzles ADD CONSTRAINT puzzles_version_format_check
    CHECK (version = 'draft' OR version ~ '^\\d+$')
  `);
  await knex.raw('CREATE INDEX puzzles_root_id_index ON puzzles (root_id)');
  await knex.raw(
    'CREATE INDEX puzzles_deleted_at_created_at_index ON puzzles (deleted_at, created_at)',
  );

  // ---- 删旧列（`puzzles_map_version_index` 随列自动消失） ----
  await knex.raw('ALTER TABLE puzzles DROP COLUMN map_project_id');
  await knex.raw('ALTER TABLE puzzles DROP COLUMN map_version_no');
  await knex.raw('ALTER TABLE puzzles DROP COLUMN grid_size');
  await knex.raw('ALTER TABLE puzzles DROP COLUMN status');
}

/**
 * 结构完全可逆：`data.map` 拆回 v1 形状，四列按它回填（`status` = `'draft'`，
 * 语义与旧列一致 —— 旧模型里它永远写 `'draft'`）。
 *
 * 版本化之后的额外行（发布产生的版本行）在旧模型里无处安放：`down` 只保留草稿
 * 行，版本行**硬删**（它们的数据是草稿的副本，草稿行还在，信息不丢）。
 */
export async function down(knex: Knex): Promise<void> {
  await knex.raw("DELETE FROM puzzles WHERE version <> 'draft'");

  await knex.raw(
    "ALTER TABLE puzzles ADD COLUMN map_project_id bigint REFERENCES maps (id) ON UPDATE CASCADE ON DELETE RESTRICT",
  );
  await knex.raw('ALTER TABLE puzzles ADD COLUMN map_version_no integer NOT NULL DEFAULT 1');
  await knex.raw('ALTER TABLE puzzles ADD COLUMN grid_size integer NOT NULL DEFAULT 1');
  await knex.raw("ALTER TABLE puzzles ADD COLUMN status varchar(16) NOT NULL DEFAULT 'draft'");

  const rows = (await knex('puzzles').select('id', 'data')) as Array<{
    id: string | number;
    data: unknown;
  }>;

  for (const row of rows) {
    const legacy = puzzleDraftToLegacy(row.data);
    if (!legacy) continue;
    await knex('puzzles').where({ id: row.id }).update({
      data: legacy.data,
      map_project_id: legacy.mapId,
      map_version_no: legacy.versionNo,
      grid_size: legacy.gridSize,
    });
  }

  // 旧模型的两条 CHECK 与索引一并还原。
  await knex.raw('ALTER TABLE puzzles ALTER COLUMN map_project_id SET NOT NULL');
  await knex.raw(
    `ALTER TABLE puzzles ADD CONSTRAINT puzzles_grid_size_check CHECK (grid_size >= ${GRID_SIZE_MIN} AND grid_size <= ${GRID_SIZE_MAX})`,
  );
  await knex.raw(
    'ALTER TABLE puzzles ADD CONSTRAINT puzzles_map_version_no_check CHECK (map_version_no >= 1)',
  );
  await knex.raw(
    'CREATE INDEX puzzles_map_version_index ON puzzles (map_project_id, map_version_no)',
  );

  await knex.raw('DROP INDEX IF EXISTS uq_puzzles_root_version');
  await knex.raw('DROP INDEX IF EXISTS puzzles_root_id_index');
  await knex.raw('DROP INDEX IF EXISTS puzzles_deleted_at_created_at_index');
  await knex.raw('ALTER TABLE puzzles DROP CONSTRAINT IF EXISTS puzzles_version_format_check');
  await knex.raw('ALTER TABLE puzzles DROP COLUMN root_id');
  await knex.raw('ALTER TABLE puzzles DROP COLUMN version');
  await knex.raw('ALTER TABLE puzzles DROP COLUMN deleted_at');
  await knex.raw('ALTER TABLE puzzles DROP COLUMN cover_path');
}
