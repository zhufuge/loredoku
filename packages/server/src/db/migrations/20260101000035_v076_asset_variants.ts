import { existsSync } from 'node:fs';
import { readdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import type { Knex } from 'knex';
import { uploadRoot } from '../../utils/paths';

/**
 * v0.7.6 —— `asset_forms` 改名 `asset_variants`，并瘦身到「只描述长相」
 * （docs/v0.7.6.md）。
 *
 * 四件事必须一起做，否则要么外键/索引指向旧名字，要么画布里的锚点指不到形态：
 *
 *   1. 表名 `asset_forms` → `asset_variants`，主键 / 外键 / 两个索引同步改名；
 *   2. 删六列：占格 `width_cells` / `height_cells`（放置恒 1 格，放大交给
 *      `scale`）、上传回执 `image_mime` / `image_size` / `image_width` /
 *      `image_height`（mime 就是路径扩展名，其余只喂过上传区一行说明）；
 *   3. 磁盘目录 `assets/<id>/forms/` → `assets/<id>/variants/`，`image_path`
 *      前缀同步（只改字符串，文件本身跟着目录搬）；
 *   4. 画布锚点的键 `formId` → `variantId`（`maps.data` 与 `puzzles.data`
 *      里内嵌的地图草稿），地图草稿 `version` 7 → 8。
 *
 * 第 4 步为什么必须落库：`draftCellSchema` 是 `.strict()`，旧键会被拒。schema
 * 那边另有一个 `formId` 别名兜底（读取旧导出文件用），但库里存的东西要干净。
 *
 * `w` / `h` 留在锚点上不动 —— 它们描述的是**这一次放置**，不是形态；老草稿里
 * 的 2×2 因此照旧渲染、照旧占格，已发布的地图一像素不变。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    await trx.schema.renameTable('asset_forms', 'asset_variants');
    await trx.raw(
      'ALTER TABLE asset_variants RENAME CONSTRAINT asset_forms_pkey TO asset_variants_pkey',
    );
    await trx.raw(
      'ALTER TABLE asset_variants RENAME CONSTRAINT asset_forms_asset_id_foreign TO asset_variants_asset_id_foreign',
    );
    await trx.raw(
      'ALTER INDEX IF EXISTS uq_asset_forms_asset_name RENAME TO uq_asset_variants_asset_name',
    );
    await trx.raw(
      'ALTER INDEX IF EXISTS asset_forms_asset_id_index RENAME TO asset_variants_asset_id_index',
    );

    await trx.schema.alterTable('asset_variants', (table) => {
      table.dropColumn('width_cells');
      table.dropColumn('height_cells');
      table.dropColumn('image_mime');
      table.dropColumn('image_size');
      table.dropColumn('image_width');
      table.dropColumn('image_height');
    });
    // 列删掉后再扫一遍：每列 NOT NULL 约束都叫 `asset_forms_<列>_not_null`，
    // 表名换了这个前缀还留着。上面显式改过主键 / 外键，这里把剩下的收尾。
    await renameLeftoverConstraints(trx, 'asset_variants', 'asset_forms_', 'asset_variants_');

    await moveVariantDirs('forms', 'variants');
    await trx.raw(`
      UPDATE asset_variants
         SET image_path = replace(image_path, '/forms/', '/variants/')
       WHERE image_path LIKE 'assets/%/forms/%'
    `);

    await rewriteAnchorKeys(trx, false);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    await trx.schema.alterTable('asset_variants', (table) => {
      table.integer('width_cells').notNullable().defaultTo(1);
      table.integer('height_cells').notNullable().defaultTo(1);
      table.string('image_mime', 64);
      table.integer('image_size');
      table.integer('image_width');
      table.integer('image_height');
    });
    // 占格删掉时没有备份：所有形态回到 1×1，这正是删除后的语义。
    await trx.raw(`UPDATE asset_variants SET width_cells = 1, height_cells = 1`);
    // 回滚时按 image_path 的扩展名补 mime；尺寸 / 体积只存在于文件里，留空。
    await trx.raw(`
      UPDATE asset_variants
         SET image_mime = CASE lower(substring(image_path from '\\.([a-z0-9]+)$'))
                            WHEN 'png'  THEN 'image/png'
                            WHEN 'jpg'  THEN 'image/jpeg'
                            WHEN 'jpeg' THEN 'image/jpeg'
                            WHEN 'webp' THEN 'image/webp'
                            WHEN 'svg'  THEN 'image/svg+xml'
                          END
       WHERE image_path IS NOT NULL
    `);

    await trx.raw(`
      UPDATE asset_variants
         SET image_path = replace(image_path, '/variants/', '/forms/')
       WHERE image_path LIKE 'assets/%/variants/%'
    `);
    await moveVariantDirs('variants', 'forms');

    await rewriteAnchorKeys(trx, true);

    await trx.raw(
      'ALTER INDEX IF EXISTS uq_asset_variants_asset_name RENAME TO uq_asset_forms_asset_name',
    );
    await trx.raw(
      'ALTER INDEX IF EXISTS asset_variants_asset_id_index RENAME TO asset_forms_asset_id_index',
    );
    await trx.raw(
      'ALTER TABLE asset_variants RENAME CONSTRAINT asset_variants_pkey TO asset_forms_pkey',
    );
    await trx.raw(
      'ALTER TABLE asset_variants RENAME CONSTRAINT asset_variants_asset_id_foreign TO asset_forms_asset_id_foreign',
    );
    await trx.schema.renameTable('asset_variants', 'asset_forms');

    // 与 up 对称：上面新加回来的两列，NOT NULL 约束是按**当时的表名**
    // （asset_variants）起的，表名已经改回 asset_forms，残留的 `asset_variants_*`
    // 约束名也一并换回来，否则回滚后的库与迁移前不同名。
    await renameLeftoverConstraints(trx, 'asset_forms', 'asset_variants_', 'asset_forms_');
  });
}

/**
 * 把 `table` 上仍以 `fromPrefix` 开头的约束改名，前缀换成 `toPrefix`。
 *
 * 只碰约束（`pg_constraint`），不碰索引——索引名在上面显式改过。用 DO 块逐条
 * 判断，缺了不会炸：不同 Postgres 版本给 NOT NULL 约束起名的规则不完全一样。
 */
async function renameLeftoverConstraints(
  trx: Knex.Transaction,
  table: string,
  fromPrefix: string,
  toPrefix: string,
): Promise<void> {
  await trx.raw(`
    DO $$
    DECLARE r record;
    BEGIN
      FOR r IN SELECT conname FROM pg_constraint
                WHERE conrelid = '${table}'::regclass AND conname LIKE '${fromPrefix}%'
      LOOP
        EXECUTE format('ALTER TABLE ${table} RENAME CONSTRAINT %I TO %I',
                       r.conname,
                       '${toPrefix}' || substring(r.conname from ${fromPrefix.length + 1}));
      END LOOP;
    END $$;
  `);
}

/**
 * `assets/<assetId>/<from>/` → `assets/<assetId>/<to>/`。
 *
 * 目录不存在（没传过图的资源）或目标已存在时跳过——重复跑不会炸，也不会把
 * 已经搬好的东西搬回去。
 */
async function moveVariantDirs(from: string, to: string): Promise<void> {
  const assetsDir = join(uploadRoot, 'assets');
  if (!existsSync(assetsDir)) return;
  const entries = await readdir(assetsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const source = join(assetsDir, entry.name, from);
    const target = join(assetsDir, entry.name, to);
    if (!existsSync(source) || existsSync(target)) continue;
    await rename(source, target);
  }
}

interface AnchorShape {
  [key: string]: unknown;
}

/**
 * 把 `cells[*].item` / `cells[*].background` 上的锚点键在两代名字之间来回切，
 * 同时把地图草稿的 `version` 在 7 与 8 之间切。
 *
 * 读的是 `maps.data`（草稿行与版本行都有）和 `puzzles.data.map.data`（谜题
 * 自带一份地图画布副本）。逐行读 → 就地改 → 回写，手法照抄 `…00028`。
 */
async function rewriteAnchorKeys(trx: Knex.Transaction, reverse: boolean): Promise<void> {
  const fromKey = reverse ? 'variantId' : 'formId';
  const toKey = reverse ? 'formId' : 'variantId';
  const version = reverse ? 7 : 8;

  const mapRows = (await trx('maps').whereNotNull('data').select('id', 'data')) as Array<{
    id: string | number;
    data: unknown;
  }>;
  for (const row of mapRows) {
    const draft = row.data as AnchorShape | null;
    if (!rewriteCells(draft, fromKey, toKey, version)) continue;
    await trx('maps')
      .where({ id: row.id })
      .update({ data: draft });
  }

  const puzzleRows = (await trx('puzzles')
    .whereNotNull('data')
    .select('id', 'data')) as Array<{ id: string | number; data: unknown }>;
  for (const row of puzzleRows) {
    const draft = row.data as AnchorShape | null;
    const map = draft?.['map'] as AnchorShape | undefined;
    const inner = map?.['data'] as AnchorShape | undefined;
    if (!rewriteCells(inner ?? null, fromKey, toKey, version)) continue;
    await trx('puzzles')
      .where({ id: row.id })
      .update({ data: draft });
  }
}

/** 就地改一个地图草稿；返回是否真的动过（没动过就不写库）。 */
function rewriteCells(
  draft: AnchorShape | null,
  fromKey: string,
  toKey: string,
  version: number,
): boolean {
  if (!draft || typeof draft !== 'object') return false;
  const cells = draft['cells'];
  let changed = draft['version'] !== version;
  if (cells && typeof cells === 'object' && !Array.isArray(cells)) {
    for (const key of Object.keys(cells as Record<string, unknown>)) {
      const cell = (cells as Record<string, AnchorShape>)[key];
      if (!cell || typeof cell !== 'object') continue;
      for (const layer of ['item', 'background']) {
        const anchor = cell[layer] as AnchorShape | undefined;
        if (!anchor || typeof anchor !== 'object') continue;
        if (!(fromKey in anchor)) continue;
        anchor[toKey] = anchor[fromKey];
        delete anchor[fromKey];
        changed = true;
      }
    }
  }
  if (changed) draft['version'] = version;
  return changed;
}
