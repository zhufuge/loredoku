import { fileUrlFromPath, type UploadedImage } from '@loredoku/shared';

/**
 * v0.8.7（docs/v0.8.7.md §2）；v0.9.5 更名：玩家侧**标记**要画的那张图，以及它是谁的。
 *
 * `source` 是「这张图从哪来」，不是装饰：谜题抽屉要据此告诉作者「这一题没有单独
 * 配置，跟随主题」；两处都照同一份顺序判断，才不会出现「抽屉说是主题的、画布上
 * 画的却是自己的」。
 */
export interface MarkRender {
  /** `<img src>` 用的站内地址（`/api/files/...`）。 */
  imageUrl: string;
  /** `puzzle` = 这一题自己配的；`theme` = 跟随主题的缺省。 */
  source: 'puzzle' | 'theme';
}

/**
 * 把两个来源解析成一张图。
 *
 * 顺序是**谜题 → 主题**：谜题自己配了就用它（覆盖），没配就跟随主题 —— 作者因此
 * 不必每建一题都去点一次上传。两边都没有才是 `null`，由调用方退回那枚 `×` 字形。
 *
 * `toUrl` 是「相对路径 → 可用的 src」那一步。默认是**接口模式**的
 * `/api/files/<path>`；播放器（v0.9.0）传自己的包根解析器，因为那边的图片是同目录
 * 下的静态文件，没有 `/api` 这层。参数化而不是让调用方改返回值：`source` 那个
 * 判断（自己配的 / 跟随主题）得和 URL 一起算出来，分两步必有一处会写岔。
 *
 * 注意这里**不判断文件在不在**：路径是服务端上传端点写进 JSON 的，文件不随行删除；
 * 真出现 404（比如有人手动清了 `storage/uploads`），浏览器会画一枚破图 —— 用
 * `onError` 回退需要组件状态，这一版不做。
 */
export function resolveMarkImage(
  puzzleRef: UploadedImage | null | undefined,
  themeRef: UploadedImage | null | undefined = null,
  toUrl: (path: string) => string = fileUrlFromPath,
): MarkRender | null {
  if (puzzleRef?.path) return { imageUrl: toUrl(puzzleRef.path), source: 'puzzle' };
  if (themeRef?.path) return { imageUrl: toUrl(themeRef.path), source: 'theme' };
  return null;
}
