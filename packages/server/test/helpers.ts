import supertest from 'supertest';
import { createApp } from '../src/app';

export const app = createApp();
export const api = supertest(app.callback());

/**
 * v0.8.0 §19 —— 没有「默认主题」了，所以新建资源必须指名一个主题。
 *
 * 大部分用例并不想验主题本身，它们只是需要一个能放下资源的落点。这里给一个
 * **固定编码**的夹具主题，幂等创建（已经有了就当成功）：以前每个用例临时建一个
 * `t-xxxxxxxx`，跑几十次之后库里积了 78 个 —— 主题变成了测试的垃圾场。
 */
export const FIXTURE_THEME_CODE = 'test-fixture';

let pending: Promise<string> | undefined;

export function fixtureTheme(): Promise<string> {
  pending ??= (async () => {
    const res = await api.post('/api/themes').send({
      code: FIXTURE_THEME_CODE,
      name: '测试夹具主题',
    });
    // 200 = 刚建出来；409 = 上一轮跑剩下的，编码本来就在，同样可用。
    if (res.status !== 200 && res.status !== 409) {
      throw new Error(`夹具主题建不出来：${res.status} ${JSON.stringify(res.body)}`);
    }
    return FIXTURE_THEME_CODE;
  })();
  return pending;
}
