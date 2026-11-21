import { useEffect, useMemo } from 'react';
import { Select } from '@/components/ui/select';
import { useThemes } from '@/hooks/useThemes';
import { cn } from '@/lib/utils';

interface ThemeScopeFieldProps {
  /** 当前选中主题**编码**（§19）。`null` = 还没选 —— 组件会同步成列表里的第一个， 让屏幕上的选择和将要提交的值始终一致。 */
  value: string | null;
  onChange: (next: string) => void;
  className?: string;
}

/** v0.8.0（docs/v0.8.0.md §16.7）—— 新建对话框里的「作用域」一格：这东西建到哪个 世界。 四个新建对话框共用。 **它只在「真的能选」时出现。 ** 弹窗里每一行都在回答一个「必须由你决定」的 问题，一行只复述地址的字段不配占那 41px —— 地址已经是 `/:themeCode/...`， 顶栏那枚识别色圆点旁边就写着主题名。 所以出现条件两条，缺一不显示： 1. **有得选**：主题上下文缺失（旧地址 `/maps`、单测、整屏入口）才需要问； 名字里的 `Pill` 已经名不副实，但文件不再改名：它仍是「作用域」这件事的 唯一实现。 */
export function ThemeScopeField({
  value,
  onChange,
  className,
}: ThemeScopeFieldProps): JSX.Element | null {
  const { data: themes } = useThemes();
  const options = useMemo(() => themes ?? [], [themes]);

  // 没显式选过（`null`）时落列表第一个（服务端按创建顺序排）。§19 起没有「默认主题」 这一档，所以这里的「第一个」只是「列表的第一个」，不是「特殊的那一个」。 这一步必须**同步到表单**：服务端不再替调用方猜主题（`themeCode` 必填），值没同步就是一次 400；而且 `theme_id` 建行之后不可改（§8 护栏 2）。
  useEffect(() => {
    if (value !== null || options.length === 0) return;
    onChange(options[0]!.code);
  }, [value, options, onChange]);

  // 主题列表还没到时不闪一个空下拉；只有一间时也没什么可问的。
  if (options.length < 2) return null;

  return (
    <div className={cn('flex min-h-10 flex-wrap items-center gap-x-2 gap-y-1', className)}>
      <span className="shrink-0 text-sm font-medium">主题</span>
      <Select
        aria-label="主题"
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-auto px-3 text-sm"
      >
        {value === null ? <option value="">请选择主题</option> : null}
        {options.map((theme) => (
          <option key={theme.code} value={theme.code}>
            {theme.name}
          </option>
        ))}
      </Select>
      <span className="text-xs text-muted-foreground">创建后不可更改</span>
    </div>
  );
}
