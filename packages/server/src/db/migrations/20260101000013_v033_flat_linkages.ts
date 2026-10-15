import type { Knex } from 'knex';
import { emptyStats, migrateDraftLinkages } from '../../service/draftLinkageMigration';

/**
 * MOD-801 (docs/v0.3.3.md §2) — flat `linkages`.
 *
 * For every `map_projects.draft_data` and `map_versions.data`:
 *   1. Merge each non-null `characterSlots[i].triggers` (click/touch groups)
 *      into a single flat `linkages` array:
 *      - all `targets` are collected;
 *      - same object (type + id / cells) + same colour counts as one entry
 *        (later wins);
 *      - the legacy `triggers` field is deleted.
 *   2. `characterSlots[i].clue` → `''` if missing.
 *   3. `linkages[].type === 'item'` → add `scope: 'all'` if missing.
 *   4. `linkages[].type === 'cell'` with legacy `{ x, y }` → `{ cells: [[x, y]] }`.
 *
 * The transform itself lives in `service/draftLinkageMigration.ts` so it can
 * be unit tested without a database.
 *
 * Idempotent: `triggers` is deleted after folding, and any `linkages` already
 * present are kept as the starting point (union, deduped), so a re-run never
 * drops data.
 *
 * Runs in a transaction. `MIGRATION_DRY_RUN=true` prints summary + rolls back.
 */
export async function up(knex: Knex): Promise<void> {
  const dryRun = process.env.MIGRATION_DRY_RUN === 'true';

  const stats = emptyStats();

  await knex.transaction(async (trx) => {
    // ---- map_projects.draft_data ----
    const projectRows = await trx('map_projects')
      .select('id', 'draft_data')
      .whereNotNull('draft_data');
    for (const row of projectRows) {
      const draft = row.draft_data;
      if (draft && typeof draft === 'object') {
        migrateDraftLinkages(draft as Record<string, unknown>, stats);
        await trx('map_projects').where('id', row.id).update({ draft_data: draft });
      }
    }

    // ---- map_versions.data ----
    const versionRows = await trx('map_versions').select('id', 'data').whereNotNull('data');
    for (const row of versionRows) {
      const data = row.data;
      if (data && typeof data === 'object') {
        migrateDraftLinkages(data as Record<string, unknown>, stats);
        await trx('map_versions').where('id', row.id).update({ data });
      }
    }

    // eslint-disable-next-line no-console
    console.log(
      `[v0.3.3] links merged: ${stats.linksMerged} (deduped: ${stats.linksDeduped}), ` +
        `clue added: ${stats.clueAdded}, item scopes added: ${stats.itemScopesAdded}, ` +
        `cell targets migrated: ${stats.cellTargetsMigrated}`,
    );

    if (dryRun) {
      // eslint-disable-next-line no-console
      console.log('[v0.3.3] DRY RUN — rolling back');
      throw new Error('DRY_RUN_ROLLBACK');
    }
  });
}

export async function down(_knex: Knex): Promise<void> {
  // Irreversible: the flat list has no record of which trigger group each
  // linkage came from, so click/touch cannot be reconstructed.
  throw new Error('v0.3.3 migration is irreversible');
}
