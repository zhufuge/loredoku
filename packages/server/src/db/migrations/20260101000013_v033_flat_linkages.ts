import type { Knex } from 'knex';
import { emptyStats, migrateDraftLinkages } from '../../service/draftLinkageMigration';

/**
 * MOD-801 (docs/v0.3.3.md §2) — flat `linkages`. For every `map_projects.draft_data`
 * and `map_versions.data`: fold `characterSlots[i].triggers` into one flat
 * `linkages` array (same object + colour = one entry, later wins), delete the legacy
 * `triggers`; default `clue` to `''`; default item `scope: 'all'`; legacy cell
 * `{ x, y }` → `{ cells: [[x, y]] }`. The transform lives in
 * `service/draftLinkageMigration.ts` so it unit-tests without a database.
 * Idempotent (union, deduped, `triggers` deleted after folding). Transactional;
 * `MIGRATION_DRY_RUN=true` prints a summary and rolls back.
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
        `clue added: ${stats.clueAdded}, asset scopes added: ${stats.assetScopesAdded}, ` +
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
