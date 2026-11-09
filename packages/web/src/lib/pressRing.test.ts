import { describe, expect, it } from 'vitest';
import { resolvePressRing } from './pressRing';

/**
 * v0.9.2 §2：主题级那圈计时环图的解析。
 *
 * 只有主题一档（环不是某一关的内容），所以这个函数除了「有没有配」之外只做一件事：
 * 把相对路径换成能塞进 `<img>` / `<image>` 的地址。`toUrl` 参数化是因为播放器要
 * 拼包根，而默认是接口模式的 `/api/files/<path>`。
 */
describe('resolvePressRing', () => {
  it('没配 / null 都给 null（调用方画内置白弧）', () => {
    expect(resolvePressRing(null)).toBeNull();
    expect(resolvePressRing(undefined)).toBeNull();
    expect(resolvePressRing({ path: '' })).toBeNull();
  });

  it('配了就拼成站内地址', () => {
    expect(resolvePressRing({ path: 'themes/1/press-ring/a.webp' })).toBe(
      '/api/files/themes/1/press-ring/a.webp',
    );
  });

  it('播放器可以用自己的包根解析器', () => {
    expect(resolvePressRing({ path: 'files/ring/press-ring.webp' }, (path) => `/loredoku/hlm/${path}`)).toBe(
      '/loredoku/hlm/files/ring/press-ring.webp',
    );
  });
});
