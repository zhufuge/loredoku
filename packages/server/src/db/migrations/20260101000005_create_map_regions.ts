import type { Knex } from 'knex';
import { DEFAULT_REGION_COLOR } from '@loredoku/shared';

// 这两个列默认值在 v0.7.0 随「区域颜色 / 填充透明度」字段一起退役，常量已从
// shared 删除；建表行为不变，就地写字面值（本迁移只在全新库上跑一次）。
const BORDER_WIDTH_DEFAULT = 6;
const FILL_OPACITY_DEFAULT = 0;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('map_regions', (table) => {
    table.bigIncrements('id').primary();
    table
      .bigInteger('project_id')
      .notNullable()
      .references('id')
      .inTable('map_projects')
      .onDelete('CASCADE')
      .onUpdate('CASCADE');
    table.string('name', 100).notNullable();
    table.text('description');
    table.string('color', 16).notNullable().defaultTo(DEFAULT_REGION_COLOR);
    table.smallint('border_width').notNullable().defaultTo(BORDER_WIDTH_DEFAULT);
    table
      .decimal('fill_opacity', 3, 2)
      .notNullable()
      .defaultTo(FILL_OPACITY_DEFAULT);
    table.jsonb('meta').notNullable().defaultTo(knex.raw(`'{}'::jsonb`));
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('map_regions');
}
