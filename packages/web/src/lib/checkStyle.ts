import {
  THEME_CHECK_FAIL_COLOR,
  THEME_CHECK_PASS_COLOR,
  fileUrlFromPath,
  type ThemeCheckStyle,
} from '@loredoku/shared';

/**
 * v0.9.3（docs/v0.9.3.md §3）：提交校验那一圈的**样子** —— 两档颜色 + 可选的圈图。
 *
 * 主题级、只有一档：校验是「这个世界怎么回应你」，不是某一关的内容，所以不做
 * 「谜题自己的 → 主题的」那套两级解析。
 *
 * 三件事在这里定下来，页面只消费结果：
 *
 * 1. **颜色兜底**。老主题没有 `checkStyle`，或者作者只配了圈图 —— 两种情况都要
 *    落回内置的绿 / 红。取色器写坏的值（空串、`#GGG`）也在这里挡掉，否则 CSS
 *    里会出现一个非法颜色，浏览器静默丢掉那一整条声明，圈就「看不见了」而不是
 *    「变了个色」。
 * 2. **圈图解析**。`toUrl` 与另外几个解析器同一条道理：默认是接口模式的
 *    `/api/files/<path>`，播放器传包根解析器。
 * 3. **不判断文件在不在**：路径是上传端点写进 JSON 的；真 404 时浏览器画破图，
 *    这一版不兜（与禁止符号 / 计时环同一个取舍）。
 */
export interface ResolvedCheckStyle {
  passColor: string;
  failColor: string;
  /** 圈图的地址；`null` = 没配，画本色细环。 */
  ringUrl: string | null;
}

/** `#RRGGBB`。与 `BG_COLOR_PATTERN` 同一条，这里不引常量是为了不把正则带进渲染层。 */
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function resolveCheckStyle(
  style: ThemeCheckStyle | null | undefined,
  toUrl: (path: string) => string = fileUrlFromPath,
): ResolvedCheckStyle {
  return {
    passColor: hexOr(style?.passColor, THEME_CHECK_PASS_COLOR),
    failColor: hexOr(style?.failColor, THEME_CHECK_FAIL_COLOR),
    ringUrl: style?.ring?.path ? toUrl(style.ring.path) : null,
  };
}

function hexOr(value: string | undefined, fallback: string): string {
  return value && HEX_COLOR.test(value) ? value : fallback;
}

/**
 * 按结果取色 —— 页面里只该出现这一句，而不是到处写 `passed ? a : b`。
 */
export function checkColorFor(style: ResolvedCheckStyle, passed: boolean): string {
  return passed ? style.passColor : style.failColor;
}
