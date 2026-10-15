import type { Knex } from 'knex';

/**
 * MOD-702 / MOD-708 (docs/v0.3.2.md)
 *
 * For every `map_projects.draft_data` and `map_versions.data`:
 *   1. Add `clue: ''` to each non-null `characterSlots[i]` entry if missing.
 *   2. Convert `triggers[].targets[]`:
 *      - `type: 'cell'` with `{ x, y }` → `{ cells: [[x, y]] }`
 *      - Legacy `{ type: 'cell', x, y }` without `cells` → becomes array form.
 *      - `type: 'item'` → add `scope: 'all'` if missing.
 *
 * Runs in a transaction. `MIGRATION_DRY_RUN=true` prints summary + rolls back.
 */
export async function up(knex: Knex): Promise<void> {
  const dryRun = process.env.MIGRATION_DRY_RUN === 'true';

  await knex.transaction(async (trx) => {
    let clueAdded = 0;
    let cellTargetsMigrated = 0;
    let itemScopesAdded = 0;

    /**
     * Patch one draft JSON object in-place:
     * - characterSlots[i].clue → '' if missing
     * - triggers[].targets[] cell target → cells array
     * - triggers[].targets[] item target → scope: 'all'
     */
    function patchDraft(draft: Record<string, unknown>): void {
      const slots = draft['characterSlots'];
      if (!Array.isArray(slots)) return;
      for (const slot of slots) {
        if (!slot || typeof slot !== 'object') continue;
        const entry = slot as Record<string, unknown>;
        if (entry['clue'] === undefined || entry['clue'] === null) {
          entry['clue'] = '';
          clueAdded++;
        }
        const triggers = entry['triggers'];
        if (!Array.isArray(triggers)) continue;
        for (const trigger of triggers) {
          if (!trigger || typeof trigger !== 'object') continue;
          const trig = trigger as Record<string, unknown>;
          const targets = trig['targets'];
          if (!Array.isArray(targets)) continue;
          for (const target of targets) {
            if (!target || typeof target !== 'object') continue;
            const tgt = target as Record<string, unknown>;
            if (tgt['type'] === 'cell' && !Array.isArray(tgt['cells'])) {
              const x = tgt['x'];
              const y = tgt['y'];
              if (typeof x === 'number' && typeof y === 'number') {
                delete tgt['x'];
                delete tgt['y'];
                tgt['cells'] = [[x, y]];
                cellTargetsMigrated++;
              }
            }
            if (tgt['type'] === 'item' && tgt['scope'] === undefined) {
              tgt['scope'] = 'all';
              itemScopesAdded++;
            }
          }
        }
      }
    }

    // ---- map_projects.draft_data ----
    const projectRows = await trx('map_projects')
      .select('id', 'draft_data')
      .whereNotNull('draft_data');
    for (const row of projectRows) {
      const draft = row.draft_data;
      if (draft && typeof draft === 'object') {
        patchDraft(draft as Record<string, unknown>);
        await trx('map_projects').where('id', row.id).update({ draft_data: draft });
      }
    }

    // ---- map_versions.data ----
    const versionRows = await trx('map_versions')
      .select('id', 'data')
      .whereNotNull('data');
    for (const row of versionRows) {
      const data = row.data;
      if (data && typeof data === 'object') {
        patchDraft(data as Record<string, unknown>);
        await trx('map_versions').where('id', row.id).update({ data });
      }
    }

    // eslint-disable-next-line no-console
    console.log(
      `[v0.3.2] clue added: ${clueAdded}, cell targets migrated: ${cellTargetsMigrated}, item scopes added: ${itemScopesAdded}`,
    );

    if (dryRun) {
      // eslint-disable-next-line no-console
      console.log('[v0.3.2] DRY RUN — rolling back');
      throw new Error('DRY_RUN_ROLLBACK');
    }
  });
}

export async function down(_knex: Knex): Promise<void> {
  // Irreversible: cell targets moved from {x,y} to cells[] cannot be
  // losslessly reverted if multiple coords were added after migration.
  throw new Error('v0.3.2 migration is irreversible');
}