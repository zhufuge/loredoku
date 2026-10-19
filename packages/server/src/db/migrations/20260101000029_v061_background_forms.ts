import type { Knex } from 'knex';

/**
 * v0.6.1 续 —— 背景资源也允许多个形态。
 *
 * 上一支迁移 `…00028` 把「一个资源一个形态」写进了数据与文档；本支把它放开：
 *   - `maps.data` / `games.snapshot.map` 的 `cells[k].background` 补 `formId`，
 *     `version` 5 → 6；
 *   - 表结构不动（`asset_forms` 早就能容纳任意多个形态，服务端的限制在代码里）。
 *
 * 补 `formId` 的手法与 `…00028` 完全一致：逐行读 JSON → 就地改 → 回写，值取
 * 「资源 → 首形态」（按 `sort_order, id`，与 API 响应的排序一致）。存量背景资源
 * 都只有一个形态，补的就是它；没有对应形态（资源已删）的格子保持原样，渲染时
 * 由 `resolveAssetForm` 兜底。
 *
 * `formId` 是可选的，所以不补数据也能跑——补只是为了「v6 画布里背景格都显式
 * 带着自己选的是哪个形态」，与 `…00028` 对物品锚点的处理保持同一个口径。
 */

export async function up(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    await rewriteBackgrounds(trx, false);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    await rewriteBackgrounds(trx, true);
  });
}

/** 给 `maps.data` 与 `games.snapshot.map` 的每个 `cells[k].background` 补（或摘掉）`formId`。 */
async function rewriteBackgrounds(trx: Knex.Transaction, reverse: boolean): Promise<void> {
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

/** 就地改写一份画布的背景引用与 version，返回是否发生了改动。 */
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
    const background = (cell as Record<string, unknown>)['background'] as
      | Record<string, unknown>
      | undefined;
    if (!background || typeof background !== 'object') continue;
    const assetId = Number(background['assetId']);
    if (!Number.isFinite(assetId)) continue;
    if (reverse) {
      if ('formId' in background) {
        delete background['formId'];
        changed = true;
      }
      continue;
    }
    const formId = firstFormByAsset.get(assetId);
    if (formId === undefined) continue;
    background['formId'] = formId;
    changed = true;
  }
  if (reverse) {
    if (draft['version'] === 6) {
      draft['version'] = 5;
      changed = true;
    }
  } else if (draft['version'] === 5) {
    draft['version'] = 6;
    changed = true;
  }
  return changed;
}
