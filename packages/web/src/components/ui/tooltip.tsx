import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';

/**
 * v0.7.9 §5：Tooltip 底座。
 *
 * 工坊的界面上有 100 处 `title=`，其中大部分挂在**纯图标按钮**上 —— 原生 title
 * 有 ~1 秒延迟、样式不可控、深色下是系统对话框的样子，而且键盘焦点停留时不出来。
 * 一个每天用一小时的工具，最常点的 28px 按钮反而最不好认。
 *
 * 三条约定：
 * - **延迟 320ms**：比原生快得多，又不至于鼠标划过工具栏时下起「提示雨」。
 * - **portal 到 body**：编辑器的左面板、抽屉、底栏都有 `overflow-hidden`，就地渲染
 *   的浮层会被裁掉一半。这也是不用纯 CSS tooltip 的原因。
 * - **外观跟 `popover` token**：它是一张纸片，不是系统气泡。深色下自动跟随。
 *
 * 这里**自带 Provider**（而不是要求应用根节点包一层）：Radix 在缺 Provider 时
 * 会直接抛错，于是任何单独渲染一个按钮的测试、或者将来某个挂在别处的浮层，都会
 * 因为「忘了包 Provider」而崩。代价是相邻按钮之间没有共享的 grace period ——
 * 每个按钮各自计 320ms，够快，也够安静。
 */
const DELAY_DURATION = 320;

/**
 * v0.7.13：提示纸片的那层皮，抽出来给**不走 Radix** 的提示复用。
 *
 * 地图画布上的物品提示挂不上 Radix —— 物品层的 `pointer-events` 在各页面是
 * `none`（游戏页要在格子上放棋子），而且它按画布坐标自己算命中。硬套
 * `TooltipTrigger` 就得先给每个物品开一层可交互的 DOM，等于为了长相改掉打点逻辑。
 * 于是只共享**长相**：`TooltipContent` 与物品名称提示都从这里取类名，
 * 工坊里的提示仍旧只有一种样子（v0.7.9 §5 的那条约定不因为实现方式而破例）。
 */
export const TOOLTIP_SURFACE_CLASS =
  'max-w-xs rounded-sm border bg-popover px-2 py-1 text-2xs text-popover-foreground shadow-lifted';

export function Tooltip({
  children,
  ...props
}: ComponentPropsWithoutRef<typeof TooltipPrimitive.Root> & { children: ReactNode }): JSX.Element {
  return (
    <TooltipPrimitive.Provider delayDuration={DELAY_DURATION} skipDelayDuration={0}>
      <TooltipPrimitive.Root {...props}>{children}</TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

export const TooltipTrigger = TooltipPrimitive.Trigger;

export const TooltipContent = forwardRef<
  ElementRef<typeof TooltipPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        // `z-[60]`：对话框/弹层是 `z-50`，抽屉是 `UI_Z` 的 20/30。提示必须永远在最上面，
        // 不能指望「后挂载所以压得住」—— 同一个对话框里再开一个浮层就会翻车。
        'z-[60]',
        TOOLTIP_SURFACE_CLASS,
        // v0.7.10：`zoom-in-95` 保留（提示是「贴上来的一小片纸」，缩放比纯淡入
        // 更像被推到你面前），但把时长显式钉成 `duration-fast` —— 之前吃的是
        // tailwindcss-animate 的默认值，与全站的 120/180/260 三档无对应关系。
        'animate-in fade-in-0 zoom-in-95 duration-fast data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-fast',
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = 'TooltipContent';
