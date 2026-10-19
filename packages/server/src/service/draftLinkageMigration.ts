/**
 * MOD-801 (docs/v0.3.3.md §2) — pure draft transform behind migration
 * `20260101000013_v033_flat_linkages`.
 *
 * Kept out of the migration directory so the transform can be unit tested
 * without a database (knex treats every file in `db/migrations` as a
 * migration and requires `up` / `down` exports).
 */

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

/**
 * Patches one draft JSON object in place:
 *  1. `characterSlots[i].clue` → `''` when missing;
 *  2. merge `characterSlots[i].triggers[].targets` into a flat `linkages`
 *     array (same object + colour counts as one entry, later wins) and drop
 *     the legacy `triggers` field;
 *  3. normalise `linkages` (asset `scope`, legacy cell shape).
 *
 * Idempotent: the legacy `triggers` field is deleted after folding, and any
 * `linkages` already present are kept as the starting point (union, deduped),
 * so re-running the transform never drops data.
 */
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

/**
 * Migrates every non-null `characterSlots` entry of one persisted draft.
 * Returns `null` for rows that never held a draft object.
 */
export function migrateStoredDraft(
  value: unknown,
): LinkageMigrationStats | null {
  if (!value || typeof value !== 'object') return null;
  return migrateDraftLinkages(value as Record<string, unknown>, emptyStats());
}
