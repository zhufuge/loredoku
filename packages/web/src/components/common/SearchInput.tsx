import { useRef, type InputHTMLAttributes } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { TOOLBAR_ICON_HOVER_CLASS } from '@/lib/toolbarButtons';
import { cn } from '@/lib/utils';

/**
 * v0.10.2：搜索框的尺寸档位。三档是对现有六处搜索框的归纳 ——
 * 列表页 40px、资源调色板 36px、角色面板 32px，不只是缩字号，放大镜与
 * 右侧留白都得跟着缩，否则小框里的图标会顶到边。
 */
export type SearchInputSize = 'md' | 'sm' | 'xs';

const SIZE_CLASSES: Record<SearchInputSize, { icon: string; input: string }> = {
  md: { icon: 'left-3 h-4 w-4', input: 'h-10 pl-9 pr-9' },
  sm: { icon: 'left-3 h-4 w-4', input: 'h-9 pl-9 pr-9' },
  xs: { icon: 'left-2.5 h-3.5 w-3.5', input: 'h-8 pl-8 pr-8 text-xs' },
};

export interface SearchInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'size'> {
  value: string;
  /**
   * 回传**未经裁剪**的原始输入。四处列表页把 `keywordInput` 交给 300ms 防抖
   * 再 `trim()` 后提交，调色板与角色面板本地过滤时也自己裁剪 —— 所以这里
   * 不替调用方 trim，否则防抖期间「输入空格」会被吞成同一次提交。
   */
  onValueChange: (next: string) => void;
  size?: SearchInputSize;
  /** 清空按钮的提示与 `aria-label`，默认「清空搜索」。 */
  clearLabel?: string;
}

/**
 * v0.10.2 用户要求：所有搜索框加一个 × 清空按钮。
 *
 * 以前六处搜索框各自手写「`relative` 包裹 + 绝对定位放大镜 + `Input`」，
 * 清空只能靠键盘退格；列表页还有 300ms 防抖，退格到空要按三四次才看到列表
 * 回来。这里收成一个共享件，顺带把三档尺寸固定下来。
 *
 * 三处细节：
 * - `pr-9` 常驻（不是只在有内容时留），否则清空按钮出现的那一刻文字会跳。
 * - 只有有内容时才渲染按钮 —— 空框上挂一枚点不动的 ×，读屏还会念出来。
 * - 清空后把焦点还回输入框：这是「重新搜」的起点，不该再点一次。
 */
export function SearchInput({
  value,
  onValueChange,
  size = 'md',
  clearLabel = '清空搜索',
  className,
  ...props
}: SearchInputProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const classes = SIZE_CLASSES[size];

  return (
    <div className={cn('relative', className)}>
      <Search
        aria-hidden
        className={cn(
          'pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground',
          classes.icon,
        )}
      />
      <Input
        ref={inputRef}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        className={classes.input}
        {...props}
      />
      {value.length > 0 ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={clearLabel}
              onClick={() => {
                onValueChange('');
                inputRef.current?.focus();
              }}
              className={cn(
                'absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground',
                TOOLBAR_ICON_HOVER_CLASS,
              )}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{clearLabel}</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}
