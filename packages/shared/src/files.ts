import { FILES_ROUTE_PREFIX } from './constants';

/**
 * v0.8.6（docs/v0.8.6.md §4）：把 `storage/uploads` 下的相对路径拼成站内地址。
 *
 * 数据里只存相对路径（`puzzles/12/forbidden-symbol/<uuid>.webp`），因为
 * `PUBLIC_BASE_URL` 会随环境变 —— 存进 JSON 的绝对地址换个端口就指向别人的服务器。
 * 页面同源取图，所以这里不需要 host：`/api/files/...` 在开发服务器由 Vite 代理到
 * 后端，生产环境由后端直接托管。
 *
 * 与 `server/utils/paths.buildFileUrl` 的关系：那个是给**对外**回执 / 导出包用的
 * 绝对地址（带 `PUBLIC_BASE_URL`）；这个给同源页面渲染。两处拼的路径段是同一个。
 */
export function fileUrlFromPath(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  return `${FILES_ROUTE_PREFIX}/${normalized}`;
}
