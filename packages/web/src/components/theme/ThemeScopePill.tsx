import { useEffect } from 'react';
import { Lock } from 'lucide-react';
import { Select } from '@/components/ui/select';
import { useThemes } from '@/hooks/useThemes';
import { cn } from '@/lib/utils';

interface ThemeScopePillProps {
  /**
   * 当前选中（或锁定的）主题**编码**（§19）。`null` = 还没选 —— 组件会同步成
   * 列表里的第一个，让屏幕上的选择和将要提交的值始终一致。
   */
  value: string | null;
  onChange?: (next: string) => void;
  /**
   * 锁定 = 主题由别的东西决定（谜题的底图、**工作空间的地址**、或已经建好的行）。
   * 锁定时渲染成只读文字 + 一句原因，**不是一个灰掉的下拉** —— 灰下拉让人以为
   * 是权限问题，而这里是「它已经定了，只是不是在这一步定的」（§16.7）。
   */
  locked?: boolean;
  /** 锁定的原因，写进胶囊里那半句小字。 */
  lockedHint?: string;
  className?: string;
}

/**
 * v0.8.0（docs/v0.8.0.md §16.7）—— 四个新建对话框共用的「作用域胶囊」。
 *
 * 一枚胶囊，两种读法：
 *
 * ```
 * [ 主题  红楼梦 ▾ ]                可换
 * [ 🔒 红楼梦 · 来自底图 ]           锁定
 * ```
 *
 * 不用「一个下拉 + 一行说明」两种控件说同一件事：那会让作者在两处找同一个信息，
 * 而且分不清哪一处是权威。
 *
 * 位置在**名称之后**（§16.7）：先说要建什么，再说它建在哪个世界里。谜题是例外 ——
 * 它的主题由底图决定，所以顺序是 名称 → 地图版本 → 主题（只读）。
 */
export function ThemeScopePill({
  value,
  onChange,
  locked = false,
  lockedHint,
  className,
}: ThemeScopePillProps): JSX.Element | null {
  const { data: themes } = useThemes();
  const options = themes ?? [];
  const current = options.find((theme) => theme.code === value) ?? null;

  // 没显式选过（`null`）时落列表第一个（服务端按创建顺序排）。§19 起没有「默认主题」
  // 这一档，所以这里的「第一个」只是「列表的第一个」，不是「特殊的那一个」。
  //
  // 这一步必须**同步到表单**：服务端不再替调用方猜主题（`themeCode` 必填），值没同步
  // 就是一次 400；而且 `theme_id` 建行之后不可改（§8 护栏 2）。
  useEffect(() => {
    if (locked || value !== null || options.length === 0) return;
    onChange?.(options[0]!.code);
  }, [locked, value, options, onChange]);

  // 只有一个主题时这枚胶囊什么也没说；主题列表还没到时也别闪一个空下拉。
  if (options.length === 0) return null;
  if (locked && !current) return null;

  if (locked) {
    return (
      <div className={cn('flex items-center gap-2 text-sm', className)}>
        <span className="shrink-0 text-xs text-muted-foreground">主题</span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed px-2.5 py-1">
          <Lock className="h-3 w-3 text-muted-foreground" />
          {current?.name ?? '未知主题'}
          {lockedHint ? <span className="text-xs text-muted-foreground">· {lockedHint}</span> : null}
        </span>
      </div>
    );
  }

  if (options.length < 2) return null;

  return (
    <div className={cn('flex items-center gap-2 text-sm', className)}>
      <span className="shrink-0 text-xs text-muted-foreground">主题</span>
      <Select
        aria-label="主题"
        value={value ?? ''}
        onChange={(event) => onChange?.(event.target.value)}
        className="h-9 w-auto rounded-full px-3 text-sm"
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
