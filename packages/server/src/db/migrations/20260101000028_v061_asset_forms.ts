import type { Knex } from 'knex';

/**
 * v0.6.1 —— 资源多形态：`assets` 的外观与占格下沉到新表 `asset_forms`。
 *
 * 改名映射（docs/v0.6.1.md §7）：
 *   - 新建 `asset_forms`，每个资源搬出一个「默认」形态（宽高 + 外观照搬旧列）；
 *   - `maps.data` / `games.snapshot.map` 的画布锚点补 `formId`，`version` 4 → 5；
 *   - `assets` 删掉九列（宽高 ×2、外观 ×7）。
 *
 * 三件必须一起做：形态表、画布引用、资产列的删除——少了任何一件，要么外观无处
 * 安放，要么锚点指不到形态。整个迁移在一个事务里，任一步失败都整体回滚。
 *
 * 磁盘上的图片**不搬**：`image_path` 是相对路径字符串，搬到形态行后指向的还是
 * 同一个文件。
 */

/** 被搬走的九列；down 时按同一个清单加回来。 */
const MOVED_COLUMNS = [
  'width_cells',
  'height_cells',
  'fit_mode',
  'image_path',
  'image_mime',
  'image_size',
  'image_width',
  'image_height',
  'bg_color',
] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    // 1. 形态表。
    await trx.schema.createTable('asset_forms', (table) => {
      table.bigIncrements('id').primary();
      table
        .bigInteger('asset_id')
        .notNullable()
        .references('id')
        .inTable('assets')
        .onDelete('CASCADE');
      table.string('name', 32).notNullable();
      table.integer('width_cells').notNullable();
      table.integer('height_cells').notNullable();
      table.string('fit_mode', 16).notNullable().defaultTo('cover');
      table.text('image_path');
      table.string('image_mime', 64);
      table.integer('image_size');
      table.integer('image_width');
      table.integer('image_height');
      table.text('bg_color');
      table.integer('sort_order').notNullable().defaultTo(0);
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(trx.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(trx.fn.now());
    });
    await trx.raw(
      `CREATE UNIQUE INDEX uq_asset_forms_asset_name ON asset_forms (asset_id, name)`,
    );
    await trx.raw(`CREATE INDEX asset_forms_asset_id_index ON asset_forms (asset_id)`);

    // 2. 每个资源搬出一个「默认」形态。背景资源的宽高照搬旧值——它不参与渲染
    //    （背景格恒 1 格），保留原值只为 down 能原样搬回。
    //
    //    `ORDER BY id` 不是可选的：形态 id 由插入顺序决定，`sort_order` 全是 0，
    //    没有它「同资源的首形态」就随执行计划漂移，up→down→up 的往返将不再可复现。
    await trx.raw(`
      INSERT INTO asset_forms (
        asset_id, name, width_cells, height_cells,
        fit_mode, image_path, image_mime, image_size, image_width, image_height,
        bg_color, sort_order, created_at, updated_at
      )
      SELECT id, '默认', width_cells, height_cells,
             fit_mode, image_path, image_mime, image_size, image_width, image_height,
             bg_color, 0, now(), now()
        FROM assets
       ORDER BY id
    `);

    // 3. 画布锚点补 formId（形态 id 由「资源 → 首形态」映射给出），version 4 → 5。
    await rewriteAnchors(trx, false);

    // 4. 资产行瘦身。
    await trx.schema.alterTable('assets', (table) => {
      table.dropColumns(...MOVED_COLUMNS);
    });
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    // 反向：先加回列，再回填，再摘掉画布里的 formId，最后删表。
    await trx.schema.alterTable('assets', (table) => {
      table.integer('width_cells').notNullable().defaultTo(1);
      table.integer('height_cells').notNullable().defaultTo(1);
      table.string('fit_mode', 16).notNullable().defaultTo('cover');
      table.text('image_path');
      table.string('image_mime', 64);
      table.integer('image_size');
      table.integer('image_width');
      table.integer('image_height');
      table.text('bg_color');
    });

    await trx.raw(`
      UPDATE assets
         SET width_cells  = f.width_cells,
             height_cells = f.height_cells,
             fit_mode     = f.fit_mode,
             image_path   = f.image_path,
             image_mime   = f.image_mime,
             image_size   = f.image_size,
             image_width  = f.image_width,
             image_height = f.image_height,
             bg_color     = f.bg_color
        FROM (
          SELECT DISTINCT ON (asset_id) *
            FROM asset_forms
           ORDER BY asset_id, sort_order, id
        ) f
       WHERE f.asset_id = assets.id
    `);

    await rewriteAnchors(trx, true);

    await trx.schema.dropTable('asset_forms');
  });
}

/**
 * 给 `maps.data` 与 `games.snapshot.map` 的每个 `cells[k].item` 补（或摘掉）
 * `formId`，并把画布 `version` 在 4 与 5 之间来回切。手法照抄 `…00025`：
 * 逐行读 JSON → 就地改 → 回写。
 */
async function rewriteAnchors(trx: Knex.Transaction, reverse: boolean): Promise<void> {
  const firstFormByAsset = await firstFormIds(trx);

  const maps = (await trx('maps')
    .whereNotNull('data')
    .select('id', 'data')) as Array<{ id: string | number; data: unknown }>;
  for (const mapRow of maps) {
    const draft = mapRow.data as Record<string, unknown> | null;
    if (!draft || typeof draft !== 'object') continue;
    if (rewriteCellMap(draft, firstFormByAsset, reverse)) {
      await trx('maps').where({ id: mapRow.id }).update({ data: draft });
    }
  }

  // games.snapshot 里 map 部分的 version 是画布快照自己的字段，走同一套转换。
  const games = (await trx('games')
    .whereNotNull('snapshot')
    .select('id', 'snapshot')) as Array<{ id: string | number; snapshot: unknown }>;
  for (const game of games) {
    const snapshot = game.snapshot as Record<string, unknown> | null;
    if (!snapshot || typeof snapshot !== 'object') continue;
    const mapPart = snapshot['map'];
    if (!mapPart || typeof mapPart !== 'object' || Array.isArray(mapPart)) continue;
    if (rewriteCellMap(mapPart as Record<string, unknown>, firstFormByAsset, reverse)) {
      await trx('games').where({ id: game.id }).update({ snapshot });
    }
  }
}

/** 资源 id → 首形态 id（按 `sort_order, id`，与 API 响应的排序一致）。 */
async function firstFormIds(trx: Knex.Transaction): Promise<Map<number, number>> {
  const rows = (await trx('asset_forms')
    .select('asset_id', 'id')
    .orderBy(['asset_id', 'sort_order', 'id'])) as Array<{
    asset_id: string | number;
    id: string | number;
  }>;
  const result = new Map<number, number>();
  for (const row of rows) {
    const assetId = Number(row.asset_id);
    if (!result.has(assetId)) result.set(assetId, Number(row.id));
  }
  return result;
}

/** 就地改写一份画布的锚点与 version，返回是否发生了改动。 */
function rewriteCellMap(
  draft: Record<string, unknown>,
  firstFormByAsset: Map<number, number>,
  reverse: boolean,
): boolean {
  const cells = draft['cells'];
  if (!cells || typeof cells !== 'object' || Array.isArray(cells)) return false;
  let changed = false;
  for (const key of Object.keys(cells)) {
    const cell = (cells as Record<string, unknown>)[key];
    if (!cell || typeof cell !== 'object' || Array.isArray(cell)) continue;
    const item = (cell as Record<string, unknown>)['item'] as Record<string, unknown> | undefined;
    if (!item || typeof item !== 'object') continue;
    const assetId = Number(item['assetId']);
    if (!Number.isFinite(assetId)) continue;
    if (reverse) {
      if ('formId' in item) {
        delete item['formId'];
        changed = true;
      }
      continue;
    }
    const formId = firstFormByAsset.get(assetId);
    if (formId === undefined) continue;
    item['formId'] = formId;
    changed = true;
  }
  if (reverse) {
    if (draft['version'] === 5) {
      draft['version'] = 4;
      changed = true;
    }
  } else if (draft['version'] === 4) {
    draft['version'] = 5;
    changed = true;
  }
  return changed;
}
