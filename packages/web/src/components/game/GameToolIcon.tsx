import type { GameToolIconKind } from '@loredoku/shared';
import { TOOL_ICON_FALLBACKS, type ToolIconRender } from '@/lib/toolIcons';

/**
 * v0.8.7 §7：工具栏上的画 —— 作者给这一枚配了图就画图，没配就是内置的 lucide 图标。
 *
 * 深色界面要翻一次：与标记同一条理由（图多半是「深墨画在透明底上」，按浅色
 * 地图纸挑的），`invert` 翻明度、`hue-rotate-180` 把色相转回来，否则红印会变青。
 *
 * v0.10.4：与 `GameToolRail` 分家 —— 图标是「作者配的图 / 内置字形」这条规则
 * 的唯一出处，撤回到与工具栏无关的单独文件里，将来别处要画同一枚也不用抄。
 */
export function GameToolIcon({
  render,
  name,
}: {
  render: ToolIconRender | undefined;
  name: GameToolIconKind;
}): JSX.Element {
  /**
   * v0.9.0 §17：四枚工具按钮的图标统一放大到 32px（`h-8 w-8`）。内置图标与作者
   * 上传的图**共用这一处尺寸** —— 否则「配了图反而变小」会像是上传坏了。
   * 按钮仍是 48px 触屏档，图标四周各留 8px；长按清除的那道扇形是填在按钮
   * 底下的（v0.9.2 §5），不与图标抢地方。
   *
   * v0.10.1 竖屏：图标仍是 2rem（`h-8 w-8`，与桌面同档），底栏高度收到 54px ——
   * 手指点在手机屏上要的是「够大够近」，不是「图标越大越好」：2rem 的图标配
   * 54 高的长条钮，四枚一排铺满屏宽，比原来 44px 的方钮好按，又不至于把
   * 棋盘和名册的高度抢掉。桌面端不动。
   */
  if (!render) {
    const Fallback = TOOL_ICON_FALLBACKS[name];
    return <Fallback className="h-8 w-8" />;
  }
  return (
    <img
      src={render.imageUrl}
      alt=""
      draggable={false}
      data-testid={`${name}-tool-icon`}
      className="h-8 w-8 select-none object-contain dark:invert dark:hue-rotate-180"
    />
  );
}
