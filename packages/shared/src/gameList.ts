import {
  THEME_GAME_LIST_COUNT_TOKEN,
  THEME_GAME_LIST_PASSED_FALLBACK,
  THEME_GAME_LIST_PLAYABLE_FALLBACK,
} from './constants';
import type { ThemeGameListTexts } from './types';

/**
 * 游戏列表页那两行字。
 *
 * 两处渲染点（工坊的 `/:code/play` 与播放器的 `/:code/play`）共用这一份解析，
 * 免得同一个主题在两个入口里说两种话 —— 它们本来就是同一页，只是一个在线上、
 * 一个在工坊里。
 */
export interface GameListTexts {
  /** 「N 关可玩」的模板（还没换数字）。 */
  playable: string;
  /** 「已通过 N 关」的模板（还没换数字）。 */
  passed: string;
}

/**
 * 读主题里那两份模板，空 / 空白 / 整份缺失都退回内置那两句。
 *
 * 为什么 `trim()` 之后再判空：作者在输入框里按了几下空格也算「配过」，而空白
 * 模板渲染出来就是一行空白 —— 那不是他想要的，是没填。
 */
export function resolveGameListTexts(list: ThemeGameListTexts | null | undefined): GameListTexts {
  const playable = list?.playable?.trim() ?? '';
  const passed = list?.passed?.trim() ?? '';
  return {
    playable: playable.length > 0 ? playable : THEME_GAME_LIST_PLAYABLE_FALLBACK,
    passed: passed.length > 0 ? passed : THEME_GAME_LIST_PASSED_FALLBACK,
  };
}

/**
 * 把模板里的 `{n}` 换成关数。
 *
 * 用 `split` / `join` 而不是 `replace`：`replace` 只换第一处，而作者完全可能把
 * 占位符写两遍（「{n} 关，共 {n} 关」）。两处都换掉总比只换一处好读。
 */
export function formatGameListCount(template: string, count: number): string {
  return template.split(THEME_GAME_LIST_COUNT_TOKEN).join(String(count));
}
