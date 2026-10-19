import { existsSync } from 'node:fs';
import { rename } from 'node:fs/promises';
import { join } from 'node:path';
import type { Knex } from 'knex';
import { uploadRoot } from '../../utils/paths';

/**
 * v0.6.0 —— 规范命名：资源库 / 画布物品层 / 阻挡标记。
 *
 * 改名映射（docs/v0.6.0.md）：
 *   - `items` 表 → `assets`；`category` 列 → `type`，取值 `object` → `item`；
 *   - `can_stand` 列 → `blocking`，语义**取反**（可站立 → 阻挡）；
 *   - 图片目录 `storage/uploads/items/` → `assets/`，`image_path` 前缀同步；
 *   - `maps.data` / `games.snapshot` 里的画布：`cells.*.object` → `item`、
 *     `itemId` → `assetId`、`objectRef` → `itemRef`，并把 `version` 3 → 4；
 *   - `puzzles.data` / `games.snapshot` 里的联动目标 `type: 'item'` → `'asset'`。
 *
 * 两件必须一起改（否则旧图 404 / 旧引用失配）：磁盘目录与库里前缀；列名与
 * JSON 里的键名。整个迁移在一个事务里，任一步失败都整体回滚。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    // 1. 表与列：items -> assets，category -> type，can_stand -> blocking。
    await trx.schema.renameTable('items', 'assets');
    await trx.schema.alterTable('assets', (table) => {
      table.renameColumn('category', 'type');
      table.renameColumn('can_stand', 'blocking');
    });
    // 2. 列值：type 的 `object` -> `item`；blocking 取反。
    await trx.raw(`UPDATE assets SET type = 'item' WHERE type = 'object'`);
    await trx.raw(`UPDATE assets SET blocking = NOT blocking`);
    // 3. 索引跟着列名走：idx_items_category -> idx_assets_type。
    await trx.raw('ALTER INDEX IF EXISTS idx_items_category RENAME TO idx_assets_type');
    // 4. 图片目录与 image_path 前缀（两个目录名都是 5 字符）。
    await moveImageDir(trx, 'items', 'assets');
    await trx.raw(`
      UPDATE assets
         SET image_path = 'assets/' || substring(image_path from 7)
       WHERE image_path LIKE 'items/%'
    `);
    // 5. 画布 JSON：cells 里的 object -> item、itemId -> assetId、objectRef -> itemRef。
    await rewriteMapCells(trx);
    // 6. 联动目标：type 'item' -> 'asset'（puzzles.data 与 games.snapshot）。
    await rewriteLinkageTargets(trx);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    // 反向先还原 JSON，再还原列值，最后还原表名。
    await rewriteLinkageTargets(trx, true);
    await rewriteMapCells(trx, true);
    await trx.raw(`
      UPDATE assets
         SET image_path = 'items/' || substring(image_path from 8)
       WHERE image_path LIKE 'assets/%'
    `);
    await moveImageDir(trx, 'assets', 'items');
    await trx.raw('ALTER INDEX IF EXISTS idx_assets_type RENAME TO idx_items_category');
    await trx.raw(`UPDATE assets SET blocking = NOT blocking`);
    await trx.raw(`UPDATE assets SET type = 'object' WHERE type = 'item'`);
    await trx.schema.alterTable('assets', (table) => {
      table.renameColumn('blocking', 'can_stand');
      table.renameColumn('type', 'category');
    });
    await trx.schema.renameTable('assets', 'items');
  });
}

/** 把 `maps.data` 与 `games.snapshot` 里的画布单元格键名改掉；`down` 时反向。 */
async function rewriteMapCells(trx: Knex.Transaction, reverse = false): Promise<void> {
  const rows = (await trx('maps')
    .whereNotNull('data')
    .select('id', 'data')) as Array<{ id: string | number; data: unknown }>;
  for (const row of rows) {
    const draft = row.data as Record<string, unknown> | null;
    if (!draft || typeof draft !== 'object') continue;
    const cells = draft['cells'];
    if (!cells || typeof cells !== 'object' || Array.isArray(cells)) continue;
    let changed = false;
    for (const key of Object.keys(cells)) {
      const cell = (cells as Record<string, unknown>)[key];
      if (!cell || typeof cell !== 'object' || Array.isArray(cell)) continue;
      const c = cell as Record<string, unknown>;
      if (reverse) {
        if ('item' in c) {
          const item = c['item'] as Record<string, unknown>;
          if (item && typeof item === 'object' && 'assetId' in item) {
            item['itemId'] = item['assetId'];
            delete item['assetId'];
          }
          c['object'] = c['item'];
          delete c['item'];
          changed = true;
        }
        if ('itemRef' in c) {
          c['objectRef'] = c['itemRef'];
          delete c['itemRef'];
          changed = true;
        }
      } else {
        if ('object' in c) {
          const object = c['object'] as Record<string, unknown>;
          if (object && typeof object === 'object' && 'itemId' in object) {
            object['assetId'] = object['itemId'];
            delete object['itemId'];
          }
          c['item'] = c['object'];
          delete c['object'];
          changed = true;
        }
        if ('objectRef' in c) {
          c['itemRef'] = c['objectRef'];
          delete c['objectRef'];
          changed = true;
        }
      }
      if ('background' in c) {
        const bg = c['background'] as Record<string, unknown>;
        if (bg && typeof bg === 'object' && !reverse && 'itemId' in bg) {
          bg['assetId'] = bg['itemId'];
          delete bg['itemId'];
          changed = true;
        }
        if (bg && typeof bg === 'object' && reverse && 'assetId' in bg) {
          bg['itemId'] = bg['assetId'];
          delete bg['assetId'];
          changed = true;
        }
      }
    }
    if (reverse) {
      if (draft['version'] === 4) {
        draft['version'] = 3;
        changed = true;
      }
    } else if (draft['version'] === 3) {
      draft['version'] = 4;
      changed = true;
    }
    if (changed) {
      await trx('maps').where({ id: row.id }).update({ data: draft });
    }
  }

  // games.snapshot 里的 map 部分走同一套转换（version 是 map 快照自己的字段）。
  const games = (await trx('games')
    .whereNotNull('snapshot')
    .select('id', 'snapshot')) as Array<{ id: string | number; snapshot: unknown }>;
  for (const game of games) {
    const snapshot = game.snapshot as Record<string, unknown> | null;
    if (!snapshot || typeof snapshot !== 'object') continue;
    const mapPart = snapshot['map'];
    if (!mapPart || typeof mapPart !== 'object' || Array.isArray(mapPart)) continue;
    const changed = rewriteCellMap(mapPart as Record<string, unknown>, reverse);
    if (changed) {
      await trx('games').where({ id: game.id }).update({ snapshot });
    }
  }
}

/** 就地改写一份画布草稿的 `cells` 键名，返回是否发生了改动。 */
function rewriteCellMap(draft: Record<string, unknown>, reverse: boolean): boolean {
  const cells = draft['cells'];
  if (!cells || typeof cells !== 'object' || Array.isArray(cells)) return false;
  let changed = false;
  for (const key of Object.keys(cells)) {
    const cell = (cells as Record<string, unknown>)[key];
    if (!cell || typeof cell !== 'object' || Array.isArray(cell)) continue;
    const c = cell as Record<string, unknown>;
    if (!reverse && 'object' in c) {
      const object = c['object'] as Record<string, unknown>;
      if (object && typeof object === 'object' && 'itemId' in object) {
        object['assetId'] = object['itemId'];
        delete object['itemId'];
      }
      c['item'] = c['object'];
      delete c['object'];
      changed = true;
    }
    if (!reverse && 'objectRef' in c) {
      c['itemRef'] = c['objectRef'];
      delete c['objectRef'];
      changed = true;
    }
    if (reverse && 'item' in c) {
      const item = c['item'] as Record<string, unknown>;
      if (item && typeof item === 'object' && 'assetId' in item) {
        item['itemId'] = item['assetId'];
        delete item['assetId'];
      }
      c['object'] = c['item'];
      delete c['item'];
      changed = true;
    }
    if (reverse && 'itemRef' in c) {
      c['objectRef'] = c['itemRef'];
      delete c['itemRef'];
      changed = true;
    }
    const bg = c['background'] as Record<string, unknown> | undefined;
    if (bg && typeof bg === 'object') {
      if (!reverse && 'itemId' in bg) {
        bg['assetId'] = bg['itemId'];
        delete bg['itemId'];
        changed = true;
      }
      if (reverse && 'assetId' in bg) {
        bg['itemId'] = bg['assetId'];
        delete bg['assetId'];
        changed = true;
      }
    }
  }
  if (!reverse && draft['version'] === 3) {
    draft['version'] = 4;
    changed = true;
  }
  if (reverse && draft['version'] === 4) {
    draft['version'] = 3;
    changed = true;
  }
  return changed;
}

/** 联动目标 `type: 'item'` <-> `type: 'asset'`，作用于 puzzles.data 与 games.snapshot。 */
async function rewriteLinkageTargets(trx: Knex.Transaction, reverse = false): Promise<void> {
  const from = reverse ? 'asset' : 'item';
  const to = reverse ? 'item' : 'asset';

  const puzzles = (await trx('puzzles')
    .whereNotNull('data')
    .select('id', 'data')) as Array<{ id: string | number; data: unknown }>;
  for (const puzzle of puzzles) {
    const data = puzzle.data as Record<string, unknown> | null;
    if (!data || typeof data !== 'object') continue;
    if (rewriteLinkages(data, from, to)) {
      await trx('puzzles').where({ id: puzzle.id }).update({ data });
    }
  }

  const games = (await trx('games')
    .whereNotNull('snapshot')
    .select('id', 'snapshot')) as Array<{ id: string | number; snapshot: unknown }>;
  for (const game of games) {
    const snapshot = game.snapshot as Record<string, unknown> | null;
    if (!snapshot || typeof snapshot !== 'object') continue;
    const changedPuzzle = rewriteLinkages(snapshot['puzzle'] as Record<string, unknown> | null, from, to);
    const changedLegacy = rewriteLinkages(
      snapshot['legacyCharacterSlots'] as unknown,
      from,
      to,
    );
    if (changedPuzzle || changedLegacy) {
      await trx('games').where({ id: game.id }).update({ snapshot });
    }
  }
}

/**
 * 就地改一份 roster 数据里所有联动目标的 `type` 值；`input` 可以是
 * puzzle 草稿（有 `characterSlots`）或 roster 数组本身。返回是否改动。
 */
function rewriteLinkages(input: unknown, from: string, to: string): boolean {
  if (!input || typeof input !== 'object') return false;
  const record = input as Record<string, unknown>;
  const slots = Array.isArray(record['characterSlots'])
    ? record['characterSlots']
    : Array.isArray(input)
      ? input
      : null;
  if (!slots) return false;
  let changed = false;
  for (const slot of slots as unknown[]) {
    if (!slot || typeof slot !== 'object' || Array.isArray(slot)) continue;
    const linkages = (slot as Record<string, unknown>)['linkages'];
    if (!Array.isArray(linkages)) continue;
    for (const linkage of linkages) {
      if (!linkage || typeof linkage !== 'object' || Array.isArray(linkage)) continue;
      const target = linkage as Record<string, unknown>;
      if (target['type'] === from) {
        target['type'] = to;
        changed = true;
      }
    }
  }
  return changed;
}

/** 搬图片目录；目标已存在则跳过（与地图封面那个迁移同一套写法）。 */
async function moveImageDir(trx: Knex.Transaction, from: string, to: string): Promise<void> {
  void trx;
  const source = join(uploadRoot, from);
  const target = join(uploadRoot, to);
  if (!existsSync(source) || existsSync(target)) return;
  await rename(source, target);
}
