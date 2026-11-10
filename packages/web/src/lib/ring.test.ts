import { describe, expect, it } from 'vitest';
import { resolveRingImage } from './ring';

/**
 * v0.9.2 §2；v0.9.5 起长按计时环与提交校验圈**合并成一张**（`ThemeRing.image`）。
 *
 * 只有主题一档（环不是某一关的内容），所以这个函数除了「有没有配」之外只做一件事：
 * 把相对路径换成能塞进 `<img>` / `<image>` 的地址。`toUrl` 参数化是因为播放器要
 * 拼包根，而默认是接口模式的 `/api/files/<path>`。
 */
describe('resolveRingImage', () => {
  it('没配 / null / 空对象都给 null（调用方画各自的内置细弧）', () => {
    expect(resolveRingImage(null)).toBeNull();
    expect(resolveRingImage(undefined)).toBeNull();
    expect(resolveRingImage({})).toBeNull();
    expect(resolveRingImage({ image: null })).toBeNull();
    expect(resolveRingImage({ image: { path: '' } })).toBeNull();
  });

  it('配了就拼成站内地址', () => {
    expect(resolveRingImage({ image: { path: 'themes/1/ring/a.webp' } })).toBe(
      '/api/files/themes/1/ring/a.webp',
    );
  });

  it('播放器可以用自己的包根解析器', () => {
    expect(
      resolveRingImage({ image: { path: 'files/ring/ring.webp' } }, (path) => `/loredoku/hlm/${path}`),
    ).toBe('/loredoku/hlm/files/ring/ring.webp');
  });
});
