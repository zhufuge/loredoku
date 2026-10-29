import { useEffect } from 'react';
import { Select } from '@/components/ui/select';
import { useThemes } from '@/hooks/useThemes';
import { cn } from '@/lib/utils';

interface ThemeScopeFieldProps {
  /**
   * 当前选中主题**编码**（§19）。`null` = 还没选 —— 组件会同步成列表里的第一个，
   * 让屏幕上的选择和将要提交的值始终一致。
   */
  value: string | null;
  onChange: (next: string) => void;
  className?: string;
}

/**
 * v0.8.0（docs/v0.8.0.md §16.7）—— 新建对话框里的「作用域」一格：这东西建到哪个
 * 世界。四个新建对话框共用。
 *
 * **它现在只在「真的能选」时出现。** v0.8.2 §14 之前，工作空间里这一格是只读的
 * 一行事实（`主题　红楼梦 · 当前工作空间`）。可地址已经是 `/:themeCode/...`，顶栏
 * 那枚识别色圆点旁边就写着主题名 —— 同一句话在一个屏上说了第三遍。弹窗里每一行
 * 都在回答一个「必须由你决定」的问题，一行只复述地址的字段不配占那 41px。
 *
 * 所以出现条件收紧成两条，缺一不显示：
 *
 * 1. **有得选**：主题上下文缺失（旧地址 `/maps`、单测、整屏入口）才需要问；
 *    在工作空间里主题由地址定，没有选择这回事。
 * 2. **值得选**：只有一间主题时不画一个只有一项的下拉 —— 那不是选择，是通知。
 *
 * 名字里的 `Pill` 是 v0.8.0 那版胶囊的遗留：胶囊在 v0.8.2 §5 换成了字段行，
 * 只读那一行又在 §14 撤掉。文件不再改名，因为这两次都只是长相变化，
 * 它仍是「作用域」这件事的唯一实现。
 */
export function ThemeScopeField({
  value,
  onChange,
  className,
}: ThemeScopeFieldProps): JSX.Element | null {
  const { data: themes } = useThemes();
  const options = themes ?? [];

  // 没显式选过（`null`）时落列表第一个（服务端按创建顺序排）。§19 起没有「默认主题」
  // 这一档，所以这里的「第一个」只是「列表的第一个」，不是「特殊的那一个」。
  //
  // 这一步必须**同步到表单**：服务端不再替调用方猜主题（`themeCode` 必填），值没同步
  // 就是一次 400；而且 `theme_id` 建行之后不可改（§8 护栏 2）。
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
