import type { Knex } from 'knex';
import { DEFAULT_ITEM_FIT_MODE, GRID_SIZE_MAX, GRID_SIZE_MIN } from '@loredoku/shared';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('items', (table) => {
    table.string('fit_mode', 16).notNullable().defaultTo(DEFAULT_ITEM_FIT_MODE);
  });

  // OPT-202: relax the canvas minimum from 3 to 2. Drop whichever CHECK constraint
  // currently guards `grid_size` (Knex/Postgres auto-naming varies) and re-add it.
  await knex.raw(`
    DO $$
    DECLARE c record;
    BEGIN
      FOR c IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'map_projects'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%grid_size%'
      LOOP
        EXECUTE format('ALTER TABLE map_projects DROP CONSTRAINT %I', c.conname);
      END LOOP;
    END $$;
  `);
  await knex.raw(
    `ALTER TABLE map_projects ADD CONSTRAINT map_projects_grid_size_check CHECK (grid_size >= 2 AND grid_size <= 24)`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE map_projects DROP CONSTRAINT IF EXISTS map_projects_grid_size_check');
  await knex.raw(
    'ALTER TABLE map_projects ADD CONSTRAINT map_projects_grid_size_check CHECK (grid_size >= 3 AND grid_size <= 24)',
  );

  await knex.schema.alterTable('items', (table) => {
    table.dropColumn('fit_mode');
  });
}
