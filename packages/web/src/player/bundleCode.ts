declare global {
  /**
   * 构建时注入的主题编码 —— 也就是这个产物里烤着的那个包的 `manifest.theme.code`。
   *
   * 为什么要有它：播放器的地址是 `/loredoku/:主题code/play`，而**产物本身只装一个
   * 包**，所以「访问 `/loredoku/` 该去哪」是构建期就定下来的事。有了这个常量，
   * 根地址可以直接跳到那个主题的关卡列表，不必让玩家自己拼 URL。
   *
   * 注入点在 `vite.player.config.ts`（`define`）；缺省值是空串，让漏配时的报错
   * 落在「包没配」上，而不是一个看不懂的 `undefined is not defined`。
   */
  const __PLAYER_BUNDLE_CODE__: string;
}

/**
 * v0.9.0（docs/v0.9.0.md §3）：这个播放器产物装的是哪个主题。
 *
 * 与路由里的 `:code` 不一致时，列表页 / 关卡页都会给一句明确的提示（部署错了
 * 目录）。它**不是**「可以装多个主题」的开关 —— 一个产物一个包，多主题就是多份
 * 产物，各自部署到各自的 `/<code>/` 下。
 */
export const BUNDLE_CODE: string =
  typeof __PLAYER_BUNDLE_CODE__ === 'string' ? __PLAYER_BUNDLE_CODE__ : '';

/** router 的 basename：`/loredoku`（`BASE_URL` 去掉结尾斜杠）。 */
export function playerBasename(): string {
  return import.meta.env.BASE_URL.replace(/\/+$/, '') || '/';
}
