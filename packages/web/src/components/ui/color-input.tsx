import { forwardRef, useEffect, useState } from 'react';
import { BG_COLOR_PATTERN } from '@loredoku/shared';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * v0.3.10 FIX-F04: a borderless native colour picker.
 *
 * The raw `<input type="color">` ships with a near-black border (and browsers
 * draw their own swatch border), which reads as a heavy outline next to the
 * light-weight controls of the 「地图基本信息」drawer. This wrapper drops the
 * border entirely, keeps a rounded swatch and adds a single hairline ring in
 * the theme's border colour so a white / very light swatch stays visible.
 */
export interface ColorInputProps {
  id?: string;
  value: string;
  /** Receives an upper-cased `#RRGGBB` string. */
  onChange: (value: string) => void;
  className?: string;
  'aria-label'?: string;
  disabled?: boolean;
}

export const ColorInput = forwardRef<HTMLInputElement, ColorInputProps>(function ColorInput(
  { id, value, onChange, className, disabled, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      id={id}
      type="color"
      disabled={disabled}
      value={value}
      onChange={(event) => onChange(event.target.value.toUpperCase())}
      className={cn(
        'h-7 w-8 shrink-0 cursor-pointer rounded-md bg-transparent p-0',
        'border-0 ring-1 ring-inset ring-border',
        // Browsers draw their own swatch border — strip it so only our ring shows.
        '[&::-webkit-color-swatch-wrapper]:p-0',
        '[&::-webkit-color-swatch]:border-0',
        '[&::-webkit-color-swatch]:rounded',
        '[&::-moz-color-swatch]:border-0',
        className,
      )}
      {...rest}
    />
  );
});

/**
 * 取色器 + hex 文本框，**一处实现的统一面孔**。
 *
 * v0.7.13：从 `components/map-editor/StyleFields` 搬到这里 —— 角色页的「默认
 * 主题色」要同一副面孔，而角色页不该从 map-editor 里借控件。
 *
 * v0.8.3：这一版把它收成**唯一**的取色控件。此前同一件事有三种长相 ——
 * 地图抽屉里是「色块 + hex」，角色页只有色块（hex 是死的一行字），主题色弹窗
 * 反过来只有一整块调色板。作者在不同页面学到的是三套操作。
 *
 * 现在固定为两个东西：色块（原生取色器）与 hex 输入框。**没有调色板**（v0.8.3
 * 收尾时按用户要求去掉）：一份十几种颜色的固定色板，能选的永远只有那十几种，
 * 而「这个空间到底用什么颜色」本来就该由作者决定 —— 原生取色器给出的色域比
 * 任何预设都宽，预设只会把界面推向同一套配色。
 *
 * hex 是**草稿**：一边打字一边要把非法中间态留在框里（`#f`、`#ff00`），只在
 * 失焦 / 回车时提交；提交不合法就回滚到当前值。取色器则即时生效。
 */
export interface ColorFieldProps {
  id?: string;
  value: string;
  commit: (value: string) => void;
  /** 取色器的无障碍名 —— 一个表单里可能有两个取色器。 */
  label?: string;
}

export function ColorField({
  id,
  value,
  commit,
  label = '选择颜色',
}: ColorFieldProps): JSX.Element {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const flush = (): void => {
    if (BG_COLOR_PATTERN.test(draft.trim())) commit(draft.trim().toUpperCase());
    else setDraft(value);
  };

  return (
    <div className="flex items-center gap-1">
      <ColorInput
        id={id}
        value={BG_COLOR_PATTERN.test(value) ? value : '#000000'}
        onChange={(next) => {
          setDraft(next);
          commit(next);
        }}
        aria-label={label}
      />
      <Input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={flush}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            flush();
          }
        }}
        className="h-7 w-[5.5rem] font-mono text-2xs"
        aria-label={`${label}（hex）`}
      />
    </div>
  );
}
