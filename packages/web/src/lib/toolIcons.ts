import {
  Eraser,
  Send,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import {
  GAME_TOOL_ICON_KINDS,
  fileUrlFromPath,
  type GameToolIconKind,
  type GameToolIcons,
} from '@loredoku/shared';

/**
 * 内置图标 —— 三枚按钮在「谁都没配」时画的画。
 *
 * 放在这里而不是各自组件里：游戏页、概览页、谜题抽屉三处都要画同一枚，各写一份
 * 迟早会有一处换成了别的图标，而那正是玩家会看出来的那种不一致。
 */
export const TOOL_ICON_FALLBACKS: Record<GameToolIconKind, LucideIcon> = {
  clear: Eraser,
  undo: Undo2,
  submit: Send,
};

/**
 * v0.8.7 §7（docs/v0.8.7.md §7）：游戏页右列三枚**动作按钮**（清除 / 撤回 / 提交）
 * 该画什么。
 *
 * 与标记（`lib/mark.ts`）是同一条解析顺序，只是消费位置不同：
 *
 * ```
 * 谜题自己的 toolIcons  →  主题的 data.toolIcons  →  内置 lucide 图标
 * ```
 *
 * `source` 不是装饰：谜题抽屉要据此说明「这一枚跟随主题」，游戏页不需要它 ——
 * 但两边都走这一个函数，才不会出现「抽屉说是主题的、按钮上画的却是自己的」。
 */
export interface ToolIconRender {
  /** `<img src>` 用的站内地址（`/api/files/...`）。 */
  imageUrl: string;
  /** `puzzle` = 这一关自己配的；`theme` = 跟随主题。 */
  source: 'puzzle' | 'theme';
}

/**
 * 一枚的最终结果；`null` = 两边都没有，调用方画内置图标。
 *
 * `toUrl` 与标记那个同一条道理：默认 `/api/files/<path>`，播放器（v0.9.0）
 * 传包根解析器 —— 那边的图片是包里的静态文件。
 */
export function resolveToolIcon(
  kind: GameToolIconKind,
  puzzleIcons: GameToolIcons | null | undefined,
  themeIcons: GameToolIcons | null | undefined,
  toUrl: (path: string) => string = fileUrlFromPath,
): ToolIconRender | null {
  const own = puzzleIcons?.[kind];
  if (own?.path) return { imageUrl: toUrl(own.path), source: 'puzzle' };
  const inherited = themeIcons?.[kind];
  if (inherited?.path) return { imageUrl: toUrl(inherited.path), source: 'theme' };
  return null;
}

/**
 * 三枚一起解的结果。
 *
 * v0.10.4：给这个形状起了名字 —— 玩家页、工具栏、提示层、图层栈四处都要写它，
 * 从前各处写成 `Partial<Record<GameToolIconKind, ToolIconRender>>`，改一处总要
 * 一起改三处。
 */
export type ToolIconsRender = Partial<Record<GameToolIconKind, ToolIconRender>>;

/**
 * 三枚一起解 —— 游戏页工具栏一次要画全套。
 *
 * 返回的是一张**只含已配置项**的表：缺席的那一枚不在表里，按钮就画内置图标。
 * 不做「三枚都填 `null`」那种形状，是因为调用方要判的本来就是「这一枚有没有」。
 */
export function resolveToolIcons(
  puzzleIcons: GameToolIcons | null | undefined,
  themeIcons: GameToolIcons | null | undefined,
  toUrl: (path: string) => string = fileUrlFromPath,
): ToolIconsRender {
  const result: ToolIconsRender = {};
  for (const kind of GAME_TOOL_ICON_KINDS) {
    const render = resolveToolIcon(kind, puzzleIcons, themeIcons, toUrl);
    if (render) result[kind] = render;
  }
  return result;
}
