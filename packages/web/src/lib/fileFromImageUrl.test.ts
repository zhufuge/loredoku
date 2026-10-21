import { afterEach, describe, expect, it, vi } from 'vitest';
import { fileFromImageUrl } from './fileFromImageUrl';

/**
 * v0.7.2 §4：「默认用谜题封面」要把已经在服务器上的那张图读成 `File` 再走同一条
 * 上传端点。读不到（404 / 非图片 / 网络炸）返回 `null` —— 封面本来就可以留空，
 * 这一步失败不该把已经成功的部署带崩。
 */
/**
 * 注意：响应体用**字符串**而不是 `new Blob(...)` —— jsdom 的 Blob 不是合法的
 * `BodyInit`，会被 `String()` 成 `[object Blob]`，type 也跟着丢。
 */
function stubFetch(impl: () => Promise<Response>): void {
  vi.stubGlobal('fetch', vi.fn(impl));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fileFromImageUrl', () => {
  it('读成 File，扩展名跟着 MIME 走', async () => {
    stubFetch(
      async () => new Response('x', { status: 200, headers: { 'content-type': 'image/webp' } }),
    );
    const file = await fileFromImageUrl('https://cdn.test/a.webp', 'midnight-garden');
    expect(file).not.toBeNull();
    expect(file?.name).toBe('midnight-garden.webp');
    expect(file?.type).toBe('image/webp');
  });

  it('SVG 的 MIME 带 +xml，扩展名只留 svg', async () => {
    stubFetch(
      async () =>
        new Response('<svg/>', {
          status: 200,
          headers: { 'content-type': 'image/svg+xml' },
        }),
    );
    const file = await fileFromImageUrl('https://cdn.test/a.svg', 'cover');
    expect(file?.name).toBe('cover.svg');
  });

  it('非 2xx 返回 null', async () => {
    stubFetch(async () => new Response(null, { status: 404 }));
    expect(await fileFromImageUrl('https://cdn.test/gone.webp', 'x')).toBeNull();
  });

  it('响应不是图片时返回 null', async () => {
    stubFetch(async () => new Response('oops', { status: 200, headers: { 'content-type': 'text/html' } }));
    expect(await fileFromImageUrl('https://cdn.test/page', 'x')).toBeNull();
  });

  it('fetch 抛错时返回 null（不把部署带崩）', async () => {
    stubFetch(() => Promise.reject(new Error('offline')));
    expect(await fileFromImageUrl('https://cdn.test/a.webp', 'x')).toBeNull();
  });
});
