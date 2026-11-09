import { fileUrlFromPath, type ForbiddenSymbolImage } from '@loredoku/shared';

/**
 * v0.9.2（docs/v0.9.2.md §2）：长按放置参与者时那圈**计时环**要画的那张图。
 *
 * 只有主题一档 —— 环属于「这个世界的操作手感」，不是某一关的内容，所以没有
 * 「谜题自己的 → 主题的」那种两级解析（禁止符号与工具图标有，是因为它们会落在
 * 棋盘上、可能被单关覆盖）。`null` = 没配，调用方画内置的那圈白弧（v0.7.11）。
 *
 * `toUrl` 与另外两个解析器同一条道理：默认是接口模式的 `/api/files/<path>`；
 * 播放器传包根解析器，因为那边是包里的静态文件（`files/ring/...`）。
 *
 * **不判断文件在不在**（同样的理由，见 `lib/forbiddenSymbol.ts`）：路径是上传端点
 * 写进 JSON 的；真 404 时浏览器会把那一格画成破图，需要 `onError` 才能兜住，这一版不做。
 */
export function resolvePressRing(
  themeRef: ForbiddenSymbolImage | null | undefined,
  toUrl: (path: string) => string = fileUrlFromPath,
): string | null {
  return themeRef?.path ? toUrl(themeRef.path) : null;
}
