import { FILES_ROUTE_PREFIX } from './constants';

/** v0.8.6（docs/v0.8.6.md §4）：`storage/uploads` 相对路径 → 站内地址。数据里只存相对路径，因为 `PUBLIC_BASE_URL` 随环境变；页面同源取图故不带 host —— 对外的绝对地址由 `server/utils/paths.buildFileUrl` 拼，路径段相同。 */
export function fileUrlFromPath(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  return `${FILES_ROUTE_PREFIX}/${normalized}`;
}
