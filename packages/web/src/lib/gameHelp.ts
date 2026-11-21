/**
 * 玩法说明「第一次进关卡自动弹一次」的记账。
 *
 * 记的是「已经给这位玩家看过」这件事，与哪一关无关 —— 每换一关都弹一次的话，
 * 第二次进来读的是同一段话，只会变成挡路的浮层。
 *
 * 键与玩家存档、计时那些并列放在 `localStorage`：它同样是**这台设备上的状态**，
 * 不进服务端，也不进导出的包。
 */
export const GAME_HELP_SEEN_KEY = 'loredoku.game.helpSeen';

export function readGameHelpSeen(): boolean {
  try {
    return window.localStorage.getItem(GAME_HELP_SEEN_KEY) === '1';
  } catch {
    // 隐私模式 / 存储被禁：当作没看过。宁可多弹一次，也不要一次都不弹。
    return false;
  }
}

export function markGameHelpSeen(): void {
  try {
    window.localStorage.setItem(GAME_HELP_SEEN_KEY, '1');
  } catch {
    // 存不下就算了：这一局照常玩，下次进来再弹一遍。
  }
}
