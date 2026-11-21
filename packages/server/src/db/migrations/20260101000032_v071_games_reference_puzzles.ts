import type { Knex } from 'knex';
import { GRID_SIZE_MAX, GRID_SIZE_MIN } from '@loredoku/shared';

/** v0.7.1 §7.2：games 只引用谜题版本行、不再自带快照，删 8 个冗余列并加 deleted_at 假删；puzzle_id 普通 UNIQUE=一行一游戏且对已删行也生效（取消部署靠同事务 delete-then-insert），slug 的 partial UNIQUE(WHERE deleted_at IS NULL) 管「删掉的 slug 可重用」，两者无关别混。 */
export async function up(knex: Knex): Promise<void> {
  // v0.4.x 遗留的无主行：没有 puzzle 就没有画布，硬删等于取消部署，slug 释放。
  await knex.raw('DELETE FROM games WHERE puzzle_id IS NULL');

  // `puzzle_id` 收紧：版本行挂着游戏时不可删（RESTRICT），一个版本行一个游戏。
  await knex.raw('ALTER TABLE games DROP CONSTRAINT games_puzzle_id_foreign');
  await knex.raw('ALTER TABLE games ALTER COLUMN puzzle_id SET NOT NULL');
  await knex.raw(`
    ALTER TABLE games ADD CONSTRAINT games_puzzle_id_foreign
    FOREIGN KEY (puzzle_id) REFERENCES puzzles (id) ON UPDATE CASCADE ON DELETE RESTRICT
  `);
  // 旧的是 `WHERE puzzle_id IS NOT NULL` 的部分唯一索引；NOT NULL 之后退化成普通唯一。
  await knex.raw('DROP INDEX games_puzzle_id_unique');
  await knex.raw('CREATE UNIQUE INDEX games_puzzle_id_unique ON games (puzzle_id)');

  // 假删 + 「删除的 slug 可重用」。旧对象是 knex `table.unique()` 建的
  // **constraint**（`00015` 建、`00027` 改名），必须 DROP CONSTRAINT。
  await knex.raw('ALTER TABLE games ADD COLUMN deleted_at timestamptz');
  await knex.raw('ALTER TABLE games DROP CONSTRAINT games_slug_unique');
  await knex.raw('CREATE UNIQUE INDEX uq_games_slug_active ON games (slug) WHERE deleted_at IS NULL');

  // 删冗余列（`project_id` 的 FK / `grid_size` 的 CHECK 随列一起消失）。
  for (const column of [
    'project_id',
    'version_no',
    'cover_mime',
    'cover_size',
    'cover_width',
    'cover_height',
    'grid_size',
    'snapshot',
  ]) {
    await knex.raw(`ALTER TABLE games DROP COLUMN ${column}`);
  }
}

/** down 结构可逆、数据近似（同 00021 口径）：底图与 gridSize 从谜题 JSON 读回、snapshot 由它重建，project_id 取谜题记录的地图 id、缺失退到最小 maps id；已取消部署的假删行先硬删，否则全覆盖 games_slug_unique 建不起来。 */
export async function down(knex: Knex): Promise<void> {
  await knex.raw('DELETE FROM games WHERE deleted_at IS NOT NULL');

  const mapIds = ((await knex('maps').select('id')) as Array<{ id: string | number }>).map((row) =>
    Number(row.id),
  );
  if (mapIds.length === 0) {
    const remaining = (await knex('games').count('id as count').first()) as
      | { count: string | number }
      | undefined;
    if (Number(remaining?.count ?? 0) > 0) {
      throw new Error('无法回滚 00032：库里有游戏但一张地图都没有，project_id 无从回填');
    }
  }
  const fallbackMapId = mapIds[0] ?? 0;

  await knex.raw('ALTER TABLE games ADD COLUMN project_id bigint');
  await knex.raw('ALTER TABLE games ADD COLUMN version_no integer');
  await knex.raw('ALTER TABLE games ADD COLUMN cover_mime varchar(64)');
  await knex.raw('ALTER TABLE games ADD COLUMN cover_size integer');
  await knex.raw('ALTER TABLE games ADD COLUMN cover_width integer');
  await knex.raw('ALTER TABLE games ADD COLUMN cover_height integer');
  await knex.raw('ALTER TABLE games ADD COLUMN grid_size integer');
  await knex.raw('ALTER TABLE games ADD COLUMN snapshot jsonb');

  const rows = (await knex('games as g')
    .join('puzzles as pz', 'pz.id', 'g.puzzle_id')
    .select('g.id', 'pz.data')) as Array<{ id: string | number; data: Record<string, unknown> }>;

  const known = new Set(mapIds);
  for (const row of rows) {
    const data = (row.data ?? {}) as {
      map?: { mapId?: unknown; versionNo?: unknown; data?: unknown };
    };
    const recorded = Number(data.map?.mapId);
    const projectId = known.has(recorded) ? recorded : fallbackMapId;
    const canvas = data.map?.data ?? {};
    const gridSize = Number((canvas as { gridSize?: unknown }).gridSize);
    await knex('games').where({ id: row.id }).update({
      project_id: projectId,
      version_no: Number(data.map?.versionNo) || 1,
      grid_size: Number.isFinite(gridSize) && gridSize > 0 ? gridSize : GRID_SIZE_MIN,
      // 旧快照形状：`{ map, puzzle }`。
      snapshot: { map: canvas, puzzle: row.data },
    });
  }

  await knex.raw('ALTER TABLE games ALTER COLUMN project_id SET NOT NULL');
  await knex.raw('ALTER TABLE games ALTER COLUMN version_no SET NOT NULL');
  await knex.raw('ALTER TABLE games ALTER COLUMN grid_size SET NOT NULL');
  await knex.raw('ALTER TABLE games ALTER COLUMN snapshot SET NOT NULL');
  await knex.raw(`
    ALTER TABLE games ADD CONSTRAINT games_project_id_foreign
    FOREIGN KEY (project_id) REFERENCES maps (id) ON UPDATE CASCADE ON DELETE CASCADE
  `);
  await knex.raw(
    `ALTER TABLE games ADD CONSTRAINT games_grid_size_check CHECK (grid_size >= ${GRID_SIZE_MIN} AND grid_size <= ${GRID_SIZE_MAX})`,
  );

  // 旧 slug 唯一：全覆盖的 constraint（不留假删行，所以不会撞号）。
  await knex.raw('DROP INDEX IF EXISTS uq_games_slug_active');
  await knex.raw('ALTER TABLE games ADD CONSTRAINT games_slug_unique UNIQUE (slug)');

  // `puzzle_id` 回到「可空 + SET NULL + 部分唯一索引」。
  await knex.raw('ALTER TABLE games DROP CONSTRAINT games_puzzle_id_foreign');
  await knex.raw('ALTER TABLE games ALTER COLUMN puzzle_id DROP NOT NULL');
  await knex.raw(`
    ALTER TABLE games ADD CONSTRAINT games_puzzle_id_foreign
    FOREIGN KEY (puzzle_id) REFERENCES puzzles (id) ON UPDATE CASCADE ON DELETE SET NULL
  `);
  await knex.raw('DROP INDEX games_puzzle_id_unique');
  await knex.raw(
    'CREATE UNIQUE INDEX games_puzzle_id_unique ON games (puzzle_id) WHERE puzzle_id IS NOT NULL',
  );

  await knex.raw('ALTER TABLE games DROP COLUMN deleted_at');
}
