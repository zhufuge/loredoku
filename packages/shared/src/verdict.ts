import {
  THEME_VERDICT_ICON_FALLBACK,
  THEME_VERDICT_TITLE_FALLBACK,
} from './constants';
import type { ThemeVerdict } from './types/domain';

/** 结算卡通过那一面，**填好缺省**之后的形状。 三样都给成「一定能画」的值：；`icon` 有图就用图，`iconText` 此时不被画（图能表达的东西文字表达不了， 两者同时出现只会把标题行挤成两截）；；没图就画 `iconText`，没写就是内置那个庆祝 emoji；；标题没写就是「解题成功」。 为什么在读取时补齐、而不是写库时补：主题是**读取时兜底**的一套（标记 / 图标 / 圆环 / 校验色都是），作者删空一项就该立刻回到默认，而不是留一串空串在库里。 */
export interface VerdictStyle {
  /** 图标位置的文字 —— 有图时不画，但它仍在这儿，方便作者改回文字。 */
  iconText: string;
  /** 图标位置的那张图（包内 / 库内相对路径）。`null` = 画 `iconText`。 */
  iconPath: string | null;
  /** 标题文字。 */
  title: string;
}

export function resolveVerdictStyle(verdict: ThemeVerdict | null | undefined): VerdictStyle {
  const iconText = verdict?.iconText?.trim() ?? '';
  const title = verdict?.title?.trim() ?? '';
  const iconPath = verdict?.icon?.path ?? null;
  return {
    iconText: iconText.length > 0 ? iconText : THEME_VERDICT_ICON_FALLBACK,
    iconPath: iconPath && iconPath.length > 0 ? iconPath : null,
    title: title.length > 0 ? title : THEME_VERDICT_TITLE_FALLBACK,
  };
}
