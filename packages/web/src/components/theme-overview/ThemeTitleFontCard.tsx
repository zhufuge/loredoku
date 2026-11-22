import { fontFamilyStack, type Theme } from '@loredoku/shared';
import { fontFamilyLabel, fontFamilyOptions } from '@/lib/fonts';
import { Select } from '@/components/ui/select';
import { useUpdateTheme } from '@/hooks/useThemes';

/**
 * 列表页标题的字体（v0.11.10）。与地图区域标签同一份字体目录：`assets/fonts/` 里有的
 * 都能选，缺字按系统回退链继续找。作者在前台列表页看到的标题，与这里选的同一支。
 *
 * 为什么即时保存：它是一格下拉，没有别的字段要一起提交，也没有「先看一眼预览才敢按」
 * 的后果 —— 与「游戏列表文案」那两格同一个手感。
 */
export function ThemeTitleFontCard({ theme }: { theme: Theme }): JSX.Element {
  const update = useUpdateTheme(theme.code);
  const current = theme.data.fontFamily ?? '';

  /** 「默认（衬线）」= 不写这个键：旧主题与新主题在这一格上都长得一样。 */
  const options = [
    { value: '', label: '默认（衬线）' },
    ...fontFamilyOptions().map((option) => ({ value: option.value, label: option.label })),
  ];
  if (current && !options.some((option) => option.value === current)) {
    options.push({ value: current, label: `${fontFamilyLabel(current)}（当前）` });
  }

  const persist = (next: string): void => {
    if (next === current) return;
    const { fontFamily: _drop, ...rest } = theme.data;
    update.mutate({ data: next ? { ...rest, fontFamily: next } : rest });
  };

  return (
    <label className="block space-y-1.5">
      <span className="text-xs text-muted-foreground">标题字体</span>
      <Select
        id="theme-title-font-family"
        value={current}
        onChange={(event) => persist(event.target.value)}
        className="h-8 w-56 text-xs"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
      <span className="block text-2xs text-muted-foreground/80">
        预览：<span style={{ fontFamily: fontFamilyStack(theme.data.fontFamily ?? 'serif') }}>{theme.name}</span>
      </span>
    </label>
  );
}
