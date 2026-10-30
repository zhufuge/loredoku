import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  /*
   * v0.7.10：`active:translate-y-px`。
   *
   * 之前按钮按下去只有颜色变化，在 ghost / outline 这两种「背景本来就是纸色」
   * 的变体上几乎看不出来 —— 点了没反应，用户会再点一次。1px 的下沉是这套
   * 「纸与墨」里最贴切的按压语汇：不是缩放（文字会跟着糊），是把纸按进桌面。
   * 只动 transform，不参与 `transition`（按下应当立刻发生，回弹也立刻）。
   */
  /*
   * v0.8.5 §5：焦点环与 `Input` 一起去掉 `ring-offset` —— 环贴着边缘画，
   * 不再隔一层 `--background`。offset 那 2px 在 `bg-card` 上比纸面暗一档，
   * 键盘聚焦时等于在按钮外面又描了一圈淡灰。
   */
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        /*
         * v0.7.2 §6：hover 用专门的 `*-hover` token，而不是 `bg-x/90` 降透明度 ——
         * 90% 的深色叠在白底上是**变浅**，越悬停越淡。token 由 index.css 按
         * 明暗两套分别给值，`transition-colors` 也终于能过渡它。
         */
        default: 'bg-primary text-primary-foreground hover:bg-primary-hover',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive-hover',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary-hover',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
