import { fileUrlFromPath } from '@loredoku/shared';
import type { ThemeRing } from '@loredoku/shared';

/**
 * v0.9.2（docs/v0.9.2.md §2）；v0.9.5 起长按计时环与提交校验圈**合并成一张**。
 *
 * 玩家看到的都是「一圈绕着一格走」：长按是等它装满（放头像）、校验是等它扫完
 * （宣布这一位对错）。所以主题里只有一个 `ring`，两个消费点读的是同一张图。
 *
 * 只有主题一档 —— 环属于「这个世界的操作手感」，不是某一关的内容，所以没有
 * 「谜题自己的 → 主题的」那种两级解析。`null` = 没配，调用方画各自的内置细弧。
 *
 * `toUrl` 与另外几个解析器同一条道理：默认是接口模式的 `/api/files/<path>`；
 * 播放器传包根解析器，因为那边是包里的静态文件（`files/ring/...`）。
 *
 * **不判断文件在不在**（同样的理由，见 `lib/mark.ts`）。
 */
export function resolveRingImage(
  themeRing: ThemeRing | null | undefined,
  toUrl: (path: string) => string = fileUrlFromPath,
): string | null {
  const path = themeRing?.image?.path;
  return path ? toUrl(path) : null;
}
