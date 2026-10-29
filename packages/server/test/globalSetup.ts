import { db } from '../src/db/knex';
import { FIXTURE_THEME_CODE } from './helpers';
import { purgeTheme, purgeTempThemes } from './purge';

/**
 * v0.8.0 §19 —— 全局收尾：把测试造出来的主题**真的**删掉。
 *
 * 各文件自己的 `afterAll` 只负责擦掉自己那份（软删），但软删不是删除：行还在，
 * `code` 还占着。收尾这一趟才是把尸体抬出去 —— 否则 `npm test` 每跑一次，
 * `themes` 表就多几行，跑上几十次就回到了「78 个 t-xxxxxxxx」那个状态。
 */
/** 不需要准备什么 —— 夹具主题由各文件在第一次用到时幂等创建。 */
export function setup(): void {}

export async function teardown(): Promise<void> {
  await purgeTheme(FIXTURE_THEME_CODE);
  await purgeTempThemes();
  await db.destroy();
}
