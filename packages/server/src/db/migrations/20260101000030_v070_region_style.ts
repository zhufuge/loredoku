import type { Knex } from 'knex';
import {
  downgradeRegionStyleDraft,
  upgradeRegionStyleDraft,
} from '../../service/regionStyleMigration';

/**
 * v0.7.0 (docs/v0.7.0.md §4) — 区域自有样式。
 *
 * 区域的 `color` / `borderWidth` / `fillOpacity` 三件套退役，换成对地图级缺省
 * 的深 partial `style`（轮廓线 / 高亮线 / 标签），填充整体移除：
 *   - `maps.data` 与 `games.snapshot.map` 的每个区域删掉三件套，旧
 *     `borderWidth` 与地图级 `regionOutline.width` 不同时才记
 *     `style.outline.width`（相同不记，渲染走缺省）；
 *   - `version` 6 → 7。
 *
 * 手法与 `…00028` / `…00029` 一致：逐行读 JSON → 就地换 → 回写。纯转换在
 * `service/regionStyleMigration.ts`（可脱离数据库单测），`mapDraftCompat.ts`
 * 里的吸收层走同一个函数，所以没跑迁移的存量行读出来也是新形状。
 *
 * down 是三件套的还原：`borderWidth` 取 `style.outline.width`（没有则取地图级
 * 缺省），`color` / `fillOpacity` 回到旧默认值——自定义填充随字段一起消失，
 * 找不回来。
 */

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

export async function up(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    await rewriteMapDrafts(trx, upgradeRegionStyleDraft);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    await rewriteMapDrafts(trx, downgradeRegionStyleDraft);
  });
}

/** 把 `maps.data` 与 `games.snapshot.map` 的每个画草稿过一遍转换，有改动才回写。 */
async function rewriteMapDrafts(
  trx: Knex.Transaction,
  transform: (draft: Record<string, unknown>) => Record<string, unknown> | null,
): Promise<void> {
  const maps = (await trx('maps')
    .whereNotNull('data')
    .select('id', 'data')) as Array<{ id: string | number; data: unknown }>;
  for (const mapRow of maps) {
    const draft = asRecord(mapRow.data);
    if (!draft) continue;
    const next = transform(draft);
    if (!next) continue;
    await trx('maps').where({ id: mapRow.id }).update({ data: next });
  }

  // games.snapshot 里 map 部分的 version 是画布快照自己的字段，走同一套转换。
  const games = (await trx('games')
    .whereNotNull('snapshot')
    .select('id', 'snapshot')) as Array<{ id: string | number; snapshot: unknown }>;
  for (const game of games) {
    const snapshot = asRecord(game.snapshot);
    if (!snapshot) continue;
    const mapPart = asRecord(snapshot['map']);
    if (!mapPart) continue;
    const next = transform(mapPart);
    if (!next) continue;
    await trx('games').where({ id: game.id }).update({ snapshot: { ...snapshot, map: next } });
  }
}
