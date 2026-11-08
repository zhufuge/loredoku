import { fileUrlFromPath, type ForbiddenSymbolImage } from '@loredoku/shared';

/**
 * v0.8.6（docs/v0.8.6.md §4）：玩家侧「禁止符号」要画的那张图。
 *
 * 谜题版本行里的 `forbiddenSymbol` 只是一条上传文件的相对路径（{@link
 * ForbiddenSymbolImage}），页面同源取图，所以这里只做一件事：拼出站内地址。
 * 两种游戏图层（放置层与工具提示层）拿同一个对象，不会各拼各的。
 */
export interface ForbiddenSymbolRender {
  /** `<img src>` 用的站内地址（`/api/files/...`）。 */
  imageUrl: string;
}

/**
 * 把 `forbiddenSymbol` 变成可渲染的地址。
 *
 * 没有配置（缺席 / `null`）就返回 `null`，由调用方退回那枚 `×` 字形 —— 这是
 * 「旧版本行没有这个键」与「作者清回了默认」两种情况的同一条出口。
 *
 * 注意这里**不判断文件在不在**：路径是服务端上传端点写进 JSON 的，文件不随行删除；
 * 真出现 404（比如有人手动清了 `storage/uploads`），浏览器会画一枚破图 —— 用
 * `onError` 回退需要组件状态，这一版不做（docs/v0.8.6.md §6）。
 */
export function resolveForbiddenSymbolImage(
  ref: ForbiddenSymbolImage | null | undefined,
): ForbiddenSymbolRender | null {
  if (!ref || !ref.path) return null;
  return { imageUrl: fileUrlFromPath(ref.path) };
}
