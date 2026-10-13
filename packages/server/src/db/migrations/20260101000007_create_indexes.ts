import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw('CREATE INDEX idx_cells_project ON map_cells(project_id)');
  await knex.raw('CREATE INDEX idx_cells_card ON map_cells(card_id)');
  await knex.raw('CREATE INDEX idx_regions_project ON map_regions(project_id)');
  await knex.raw('CREATE INDEX idx_triggers_card ON card_triggers(card_id)');
  await knex.raw('CREATE INDEX idx_triggers_kv ON card_triggers(trigger_key, trigger_value)');
  await knex.raw('CREATE INDEX idx_cards_meta ON cards USING GIN (meta)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS idx_cards_meta');
  await knex.raw('DROP INDEX IF EXISTS idx_triggers_kv');
  await knex.raw('DROP INDEX IF EXISTS idx_triggers_card');
  await knex.raw('DROP INDEX IF EXISTS idx_regions_project');
  await knex.raw('DROP INDEX IF EXISTS idx_cells_card');
  await knex.raw('DROP INDEX IF EXISTS idx_cells_project');
}
