/** MOD-801 (docs/v0.3.3.md §2)：迁移 `20260101000013_v033_flat_linkages` 背后的纯转换。
 *  放在 migrations 外才能脱离数据库单测 —— knex 会把该目录每个文件当迁移要求 up/down。 */

/** Counters describing what one draft transform changed. */
export interface LinkageMigrationStats {
  /** Targets folded in from the legacy grouped `triggers`. */
  linksMerged: number;
  /** Targets dropped because the same object + colour was already present. */
  linksDeduped: number;
  /** Slots that received `clue: ''`. */
  clueAdded: number;
  /** `asset` linkages that received `scope: 'all'`. */
  assetScopesAdded: number;
  /** `cell` linkages converted from `{ x, y }` to `{ cells: [[x, y]] }`. */
  cellTargetsMigrated: number;
}

export function emptyStats(): LinkageMigrationStats {
  return {
    linksMerged: 0,
    linksDeduped: 0,
    clueAdded: 0,
    assetScopesAdded: 0,
    cellTargetsMigrated: 0,
  };
}

/** Stable identity of one target: type + object key (colour excluded). */
export function linkageTargetKey(target: Record<string, unknown>): string {
  switch (target['type']) {
    case 'character':
      return `character:${target['id']}`;
    case 'asset':
      return `asset:${target['id']}`;
    case 'region':
      return `region:${target['id']}`;
    case 'cell': {
      const cells = Array.isArray(target['cells']) ? (target['cells'] as unknown[]) : [];
      const coords = cells
        .map((cell) => (Array.isArray(cell) ? cell.join(',') : String(cell)))
        .sort()
        .join('|');
      return `cell:${coords}`;
    }
    default:
      return `unknown:${JSON.stringify(target)}`;
  }
}

/** Normalises one linkage object in place; returns true when it changed. */
function normalizeLinkage(
  linkage: Record<string, unknown>,
  stats: LinkageMigrationStats,
): boolean {
  let changed = false;
  if (linkage['type'] === 'asset' && linkage['scope'] === undefined) {
    linkage['scope'] = 'all';
    stats.assetScopesAdded++;
    changed = true;
  }
  if (linkage['type'] === 'cell' && !Array.isArray(linkage['cells'])) {
    const x = linkage['x'];
    const y = linkage['y'];
    if (typeof x === 'number' && typeof y === 'number') {
      delete linkage['x'];
      delete linkage['y'];
      linkage['cells'] = [[x, y]];
      stats.cellTargetsMigrated++;
      changed = true;
    }
  }
  return changed;
}

/** 就地修补一份草稿：`clue` 缺省补 `''`；`triggers[].targets` 并入扁平 `linkages`（同对象+颜色算一条，后者胜）并删 triggers；
 *  再规整 `linkages`（asset scope、旧 cell 形状）。幂等：重复跑不丢数据。 */
export function migrateDraftLinkages(
  draft: Record<string, unknown>,
  stats: LinkageMigrationStats = emptyStats(),
): LinkageMigrationStats {
  const slots = draft['characterSlots'];
  if (!Array.isArray(slots)) return stats;

  for (const slot of slots) {
    if (!slot || typeof slot !== 'object') continue;
    const entry = slot as Record<string, unknown>;

    if (entry['clue'] === undefined || entry['clue'] === null) {
      entry['clue'] = '';
      stats.clueAdded++;
    }

    const existing = Array.isArray(entry['linkages'])
      ? (entry['linkages'] as unknown[]).filter(
          (item): item is Record<string, unknown> =>
            Boolean(item) && typeof item === 'object',
        )
      : [];

    const byIdentity = new Map<string, Record<string, unknown>>();
    for (const linkage of existing) {
      byIdentity.set(`${linkageTargetKey(linkage)}|${String(linkage['color'] ?? '')}`, linkage);
    }

    const triggers = entry['triggers'];
    if (Array.isArray(triggers)) {
      for (const trigger of triggers) {
        if (!trigger || typeof trigger !== 'object') continue;
        const targets = (trigger as Record<string, unknown>)['targets'];
        if (!Array.isArray(targets)) continue;
        for (const raw of targets) {
          if (!raw || typeof raw !== 'object') continue;
          const target = { ...(raw as Record<string, unknown>) };
          normalizeLinkage(target, stats);
          stats.linksMerged++;
          const identity = `${linkageTargetKey(target)}|${String(target['color'] ?? '')}`;
          if (byIdentity.has(identity)) stats.linksDeduped++;
          byIdentity.set(identity, target);
        }
      }
      delete entry['triggers'];
    }

    const linkages = [...byIdentity.values()];
    for (const linkage of linkages) {
      normalizeLinkage(linkage, stats);
    }
    entry['linkages'] = linkages;
  }

  return stats;
}

/** Migrates every non-null `characterSlots` entry of one persisted draft. Returns `null` for rows that never held a draft object. */
export function migrateStoredDraft(
  value: unknown,
): LinkageMigrationStats | null {
  if (!value || typeof value !== 'object') return null;
  return migrateDraftLinkages(value as Record<string, unknown>, emptyStats());
}
