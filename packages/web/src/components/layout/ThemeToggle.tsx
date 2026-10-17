import { Monitor, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';
import type { ThemeMode } from '@/lib/theme';

/**
 * v0.5.7: 三态循环按钮 —— 浅色 → 深色 → 跟随系统 → 浅色。
 *
 * 图标表示**当前模式**（不是「点完会变成什么」）：跟随系统是 Monitor，手动选定
 * 的是太阳/月亮。这样扫一眼就知道自己是「跟着系统」还是「钉死了」，否则用户
 * 会在系统切外观时怀疑页面坏了。
 */
const MODE_LABEL: Record<ThemeMode, string> = {
  system: '跟随系统',
  light: '浅色',
  dark: '深色',
};

export interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps): JSX.Element {
  const { mode, resolved, cycle } = useTheme();
  const Icon = mode === 'system' ? Monitor : resolved === 'dark' ? Moon : Sun;
  const label = `主题：${MODE_LABEL[mode]}（点击切换）`;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn('shrink-0', className)}
      onClick={cycle}
      title={label}
      aria-label={label}
      data-testid="theme-toggle"
      data-theme-mode={mode}
      data-theme-resolved={resolved}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}
