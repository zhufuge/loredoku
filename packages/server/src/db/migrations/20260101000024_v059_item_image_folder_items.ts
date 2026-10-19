import { existsSync } from 'node:fs';
import { rename } from 'node:fs/promises';
import { join } from 'node:path';
import type { Knex } from 'knex';
import { uploadRoot } from '../../utils/paths';

/**
 * 物品图目录从 `storage/uploads/cards/` 迁到 `items/`。
 *
 * `cards` 表在 v0.2 已改叫 `items`，目录名却留在旧语汇里。`items.image_path`
 * 存的是相对 `UPLOAD_ROOT` 的路径，所以磁盘目录与库里的前缀必须一起改 ——
 * 只做一半，旧图一律 404。
 *
 * 已经手工搬过目录的环境（目标已存在）跳过搬运；`down` 方向同理。
 */
export async function up(knex: Knex): Promise<void> {
  await moveImageDir('cards', 'items');
  await knex.raw(`
    UPDATE items
       SET image_path = 'items/' || substring(image_path from 7)
     WHERE image_path LIKE 'cards/%'
  `);
}

export async function down(knex: Knex): Promise<void> {
  await moveImageDir('items', 'cards');
  await knex.raw(`
    UPDATE items
       SET image_path = 'cards/' || substring(image_path from 7)
     WHERE image_path LIKE 'items/%'
  `);
}

async function moveImageDir(from: string, to: string): Promise<void> {
  const source = join(uploadRoot, from);
  const target = join(uploadRoot, to);
  if (!existsSync(source) || existsSync(target)) return;
  await rename(source, target);
}
