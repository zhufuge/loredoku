import { db } from '../src/db/knex';
import { FIXTURE_THEME_CODE } from './helpers';
import { purgeTheme, purgeTempThemes } from './purge';

/**
 * v0.8.0 §19 —— 全局收尾：把测试造出来的主题**真的**删掉。
 *
 * 各文件自己的 `afterAll` 只擦自己那份，而夹具主题（`test-fixture`）是**故意**留着
 * 复用下一次的，它身上还挂着资源 / 角色 / 地图 / 谜题 —— 走接口删不掉（会被 409 挡），
 * 所以得按外键顺序拆。这一趟就是那个拆的动作。
 *
 * v0.8.3 §15 起主题本身是硬删，`DELETE` 不再留尸体；这条收尾仍然需要，理由换成了
 * 「夹具主题有子行」，不再是为了清理软删垃圾。
 */
/** 不需要准备什么 —— 夹具主题由各文件在第一次用到时幂等创建。 */
export function setup(): void {}

export async function teardown(): Promise<void> {
  await purgeTheme(FIXTURE_THEME_CODE);
  await purgeTempThemes();
  await db.destroy();
}
