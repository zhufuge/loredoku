import { existsSync } from 'node:fs';
import { rename } from 'node:fs/promises';
import { join } from 'node:path';
import type { Knex } from 'knex';
import { uploadRoot } from '../../utils/paths';

/**
 * 封面目录从 `storage/uploads/projects/` 迁到 `maps/`。
 *
 * 旧目录名来自已经消失的 `projects` 表；`maps` 才是现在的元素名。`cover_path`
 * 里存的是相对 `UPLOAD_ROOT` 的路径，所以只改 `maps` 行还不够 —— 磁盘上的
 * 目录要跟着搬，否则旧封面全部 404。两件事放在同一个迁移里做：这是唯一能
 * 保证「库里指向的文件真的在那儿」的地方。
 *
 * 已经手工搬过目录的环境（目标已存在）跳过搬运；`down` 方向同理。
 */
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
