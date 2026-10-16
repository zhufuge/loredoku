import type { Knex } from 'knex';
import { CHARACTER_GENDERS, DEFAULT_CHARACTER_GENDER } from '@loredoku/shared';

/**
 * FEAT-501: characters gain a `gender` column
 * (`male` / `female` / `other` / `unknown`).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('characters', (table) => {
    table.string('gender', 16).notNullable().defaultTo(DEFAULT_CHARACTER_GENDER);
  });

  await knex.raw(`
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
  const values = CHARACTER_GENDERS.map((value) => `'${value}'`).join(', ');
  await knex.raw(
    `ALTER TABLE characters ADD CONSTRAINT characters_gender_check CHECK (gender IN (${values}))`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE characters DROP CONSTRAINT IF EXISTS characters_gender_check');
  await knex.schema.alterTable('characters', (table) => {
    table.dropColumn('gender');
  });
}
