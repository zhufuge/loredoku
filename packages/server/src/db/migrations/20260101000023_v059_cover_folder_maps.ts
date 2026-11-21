import { existsSync } from 'node:fs';
import { rename } from 'node:fs/promises';
import { join } from 'node:path';
import type { Knex } from 'knex';
import { uploadRoot } from '../../utils/paths';

/** 封面目录 storage/uploads/projects/ → maps/：cover_path 是相对 UPLOAD_ROOT 的路径，DB 改名必须与磁盘搬目录在同一迁移里做，否则旧封面全 404；目标目录已存在则跳过（down 同理）。 */
export async function up(knex: Knex): Promise<void> {
  await moveCoverDir('projects', 'maps');
  await knex.raw(`
    UPDATE maps
       SET cover_path = 'maps/' || substring(cover_path from 10)
     WHERE cover_path LIKE 'projects/%'
  `);
}

export async function down(knex: Knex): Promise<void> {
  await moveCoverDir('maps', 'projects');
  await knex.raw(`
    UPDATE maps
       SET cover_path = 'projects/' || substring(cover_path from 6)
     WHERE cover_path LIKE 'maps/%'
  `);
}

async function moveCoverDir(from: string, to: string): Promise<void> {
  const source = join(uploadRoot, from);
  const target = join(uploadRoot, to);
  if (!existsSync(source) || existsSync(target)) return;
  await rename(source, target);
}
