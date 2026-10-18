import type { Knex } from 'knex';
import { DEFAULT_CHARACTER_GENDER } from '@loredoku/shared';

/**
 * CLAR-601 / CLAR-603 (docs/v0.3.1.md)
 *
 * 1. Normalise the `characters.gender` column to `male` / `female` only.
 *    - Existing rows where `gender ∈ ('other', 'unknown')` or NULL → `'male'`.
 *    - Drop the v0.3.0 CHECK constraint that allowed four enum values.
 *    - Add a new CHECK `gender IN ('male', 'female')` and default `'male'`.
 *
 * 2. Migrate map JSON:
 *    - For every `map_projects.draft_data` and `map_versions.data`:
 *      - Walk legacy `placedCharacters[]` entries; for each, locate the
 *        `characterSlots[]` element whose `characterId` matches and copy
 *        `themeColor` + `triggers` onto it. If no matching slot exists,
 *        write to the first empty (`null`) slot (per the spec's fallback).
 *      - Drop the legacy `placedCharacters` field.
 *      - Ensure every non-null slot entry carries `themeColor` + `triggers`
 *        (apply defaults when missing).
 *      - Truncate / pad `characterSlots` length to `gridSize`.
 *
 * The migration runs inside a transaction. Setting `MIGRATION_DRY_RUN=true`
 * prints the count summary without committing (rolls back at the end).
 */
export async function up(knex: Knex): Promise<void> {
  const dryRun = process.env.MIGRATION_DRY_RUN === 'true';

  await knex.transaction(async (trx) => {
    // ---- 1. Gender normalisation ----
    const normalised = await trx('characters')
      .whereNull('gender')
      .orWhere('gender', 'in', ['other', 'unknown'])
      .update({ gender: DEFAULT_CHARACTER_GENDER, updated_at: trx.fn.now() });
    // eslint-disable-next-line no-console
    console.log(`[v0.3.1] normalised ${normalised} character gender rows to 'male'`);

    // Drop any CHECK constraint referencing gender.
    await trx.raw(`
      DO $$
      DECLARE c record;
      BEGIN
        FOR c IN
          SELECT conname
          FROM pg_constraint
          WHERE conrelid = 'characters'::regclass
            AND contype = 'c'
            AND pg_get_constraintdef(oid) ILIKE '%gender%'
        LOOP
          EXECUTE format('ALTER TABLE characters DROP CONSTRAINT %I', c.conname);
        END LOOP;
      END $$;
    `);
    await trx.raw(`
      ALTER TABLE characters
        ADD CONSTRAINT characters_gender_check CHECK (gender IN ('male', 'female'))
    `);
    await trx.raw(`ALTER TABLE characters ALTER COLUMN gender SET DEFAULT '${DEFAULT_CHARACTER_GENDER}'`);

    // ---- 2. Map JSON migration ----
    type SlotEntry = {
      characterId: number;
      themeColor?: string;
      triggers?: unknown[];
    };
    type PlacedCharacter = {
      characterId: number;
      x?: number;
      y?: number;
      mapMeta?: Record<string, unknown>;
      originSlotIndex?: number;
      themeColor?: string;
      triggers?: unknown[];
    };
    type DraftLike = {
      version?: number;
      gridSize?: number;
      cells?: Record<string, unknown>;
      regions?: unknown[];
      characterSlots?: Array<SlotEntry | null>;
      placedCharacters?: PlacedCharacter[];
    };

    const DEFAULT_THEME = '#FFFFFF';

    function ensureSlot(entry: SlotEntry | null | undefined): SlotEntry | null {
      if (!entry) return null;
      return {
        characterId: entry.characterId,
        themeColor: entry.themeColor ?? DEFAULT_THEME,
        triggers: entry.triggers ?? [],
      };
    }

    function migrateDraft(draft: DraftLike | null | undefined): {
      draft: DraftLike | null;
      changed: boolean;
      migratedSlots: number;
      droppedPlaced: number;
    } {
      if (!draft) return { draft: null, changed: false, migratedSlots: 0, droppedPlaced: 0 };
      const gridSize = typeof draft.gridSize === 'number' ? draft.gridSize : 0;
      const placedList = Array.isArray(draft.placedCharacters) ? draft.placedCharacters : [];
      if (placedList.length === 0) {
        // Still normalise slot defaults and ensure the array length matches gridSize.
        let slots = (draft.characterSlots ?? []).map(ensureSlot);
        if (gridSize > 0) {
          while (slots.length < gridSize) slots.push(null);
          if (slots.length > gridSize) slots = slots.slice(0, gridSize);
        }
        const changed =
          JSON.stringify(slots) !== JSON.stringify(draft.characterSlots ?? []) ||
          draft.placedCharacters !== undefined;
        const next: DraftLike = {
          version: draft.version,
          gridSize: draft.gridSize,
          cells: draft.cells,
          regions: draft.regions,
          characterSlots: slots,
        };
        return { draft: next, changed, migratedSlots: 0, droppedPlaced: 0 };
      }

      let slots = (draft.characterSlots ?? []).map(ensureSlot);
      if (gridSize > 0) {
        while (slots.length < gridSize) slots.push(null);
        if (slots.length > gridSize) slots = slots.slice(0, gridSize);
      }

      let migratedSlots = 0;
      for (const placed of placedList) {
        const targetId = placed.characterId;
        let slotIndex = slots.findIndex(
          (slot) => slot !== null && slot.characterId === targetId,
        );
        if (slotIndex === -1) {
          // Spec fallback: write into the first empty slot. If none, skip.
          slotIndex = slots.findIndex((slot) => slot === null);
          if (slotIndex === -1) continue;
          slots[slotIndex] = {
            characterId: targetId,
            themeColor: placed.themeColor ?? DEFAULT_THEME,
            triggers: placed.triggers ?? [],
          };
          migratedSlots += 1;
          continue;
        }
        const existing = slots[slotIndex];
        if (existing) {
          slots[slotIndex] = {
            characterId: existing.characterId,
            themeColor: placed.themeColor ?? existing.themeColor ?? DEFAULT_THEME,
            triggers: placed.triggers ?? existing.triggers ?? [],
          };
          migratedSlots += 1;
        }
      }

      const next: DraftLike = {
        version: draft.version,
        gridSize: draft.gridSize,
        cells: draft.cells,
        regions: draft.regions,
        characterSlots: slots,
      };
      return {
        draft: next,
        changed: true,
        migratedSlots,
        droppedPlaced: placedList.length,
      };
    }

    let draftMigrated = 0;
    let versionMigrated = 0;

    // Drafts
    const projects = (await trx('map_projects')
      .whereNotNull('draft_data')
      .select('id', 'draft_data')) as Array<{ id: string | number; draft_data: DraftLike | null }>;
    for (const project of projects) {
      const result = migrateDraft(project.draft_data);
      if (!result.changed || !result.draft) continue;
      draftMigrated += 1;
      if (dryRun) {
        // eslint-disable-next-line no-console
        console.log(
          `[dry-run] project ${project.id}: migrated ${result.migratedSlots} slot(s), dropped ${result.droppedPlaced} placed character(s)`,
        );
      } else {
        await trx('map_projects')
          .where({ id: project.id })
          .update({ draft_data: result.draft, draft_updated_at: trx.fn.now() });
      }
    }

    // Versions
    const versions = (await trx('map_versions')
      .whereNotNull('data')
      .select('id', 'data')) as Array<{ id: string | number; data: DraftLike | null }>;
    for (const version of versions) {
      const result = migrateDraft(version.data);
      if (!result.changed || !result.draft) continue;
      versionMigrated += 1;
      if (dryRun) {
        // eslint-disable-next-line no-console
        console.log(
          `[dry-run] version ${version.id}: migrated ${result.migratedSlots} slot(s), dropped ${result.droppedPlaced} placed character(s)`,
        );
      } else {
        await trx('map_versions').where({ id: version.id }).update({ data: result.draft });
      }
    }

    // eslint-disable-next-line no-console
    console.log(
      `[v0.3.1] migrated ${draftMigrated} draft(s) and ${versionMigrated} version(s)`,
    );

    if (dryRun) {
      throw new Error('MIGRATION_DRY_RUN: rolling back after preview');
    }
  });
}

export async function down(knex: Knex): Promise<void> {
  // Best-effort rollback: restore the v0.3.0 CHECK constraint and default.
  // Map JSON migration is one-way; existing `placedCharacters` cannot be
  // reconstructed from the merged slot entries.
  await knex.raw('ALTER TABLE characters DROP CONSTRAINT IF EXISTS characters_gender_check');
  await knex.raw(
    `ALTER TABLE characters ADD CONSTRAINT characters_gender_check CHECK (gender IN ('male', 'female', 'other', 'unknown'))`,
  );
  await knex.raw(`ALTER TABLE characters ALTER COLUMN gender SET DEFAULT 'unknown'`);
}
