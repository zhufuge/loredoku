import { forwardRef, type ReactNode } from 'react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export interface IconButtonProps extends Omit<ButtonProps, 'size' | 'children' | 'aria-label'> {
  /** 图标就一个，别塞文字。 */
  icon: ReactNode;
  /** **唯一真源**：既是悬浮提示，也是 `aria-label`。 两件事写在一处，同一排按钮就不会有的两样都有、有的只有 title（屏幕阅读器读得到，但样式是系统气泡）。 */
  label: string;
  /** 有快捷键的动作，把组合键挂在提示右侧，例如 `Ctrl+Z`。 */
  shortcut?: string;
  /** 提示出现的方向。底栏的按钮在屏幕下缘，需要 `top`。 */
  side?: 'top' | 'right' | 'bottom' | 'left';
}

/**
 * v0.7.9 §5：纯图标按钮的唯一写法。 尺寸不进 `size` 变体（那是「有文字的按钮」的档位），由调用处用 `className` 给：工具条 `h-8 w-8`、面板 `h-7 w-7`、底栏 `h-9 w-9`。对照组件的档位表见 `docs/design-system.md` §3.7。
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon, label, shortcut, side = 'bottom', className, ...props }, ref) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button ref={ref} size="icon" aria-label={label} className={className} {...props}>
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side={side}>
        {label}
        {shortcut ? (
          <span className="ml-1.5 text-muted-foreground tabular-nums">{shortcut}</span>
        ) : null}
      </TooltipContent>
    </Tooltip>
  ),
);
IconButton.displayName = 'IconButton';
