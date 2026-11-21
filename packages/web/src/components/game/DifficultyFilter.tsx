import type { ThemeDifficultyTier } from '@loredoku/shared';
import { cn } from '@/lib/utils';

/**
 * 难度过滤条 —— 「全部」在前，后面是**这个主题**的分级。
 *
 * 两个列表页（工坊的 `/:code/play` 与播放器的 `/:code/play`）共用这一个，
 * 免得一处改了档位顺序、另一处还是老样子。
 *
 * 为什么列全部档位、连一关都没有的档也列：它回答的是「这个主题有哪几档」，
 * 藏起来反而让人以为分级少了。选到空档时页面会说明「这一档还没有关卡」。
 */
export function DifficultyFilter({
  tiers,
  value,
  onChange,
  className,
}: {
  tiers: readonly ThemeDifficultyTier[];
  /** `null` = 全部。 */
  value: number | null;
  onChange: (next: number | null) => void;
  className?: string;
}): JSX.Element | null {
  // 没有分级可列时整条不画 —— 只剩一枚「全部」的过滤条是纯噪音。
  if (tiers.length === 0) return null;

  return (
    <div
      data-testid="games-difficulty-filter"
      role="group"
      aria-label="按难度筛选"
      className={cn('flex flex-wrap items-center gap-2', className)}
    >
      <Chip active={value === null} onClick={() => onChange(null)}>
        全部
      </Chip>
      {tiers.map((tier) => (
        <Chip key={tier.level} active={value === tier.level} onClick={() => onChange(tier.level)}>
          {tier.label}
        </Chip>
      ))}
    </div>
  );
}

/**
 * 一枚过滤按钮。用 `aria-pressed` 而不是换 role：它是一组开关里的一个，
 * 不是一组标签页 —— 读屏念「全部，已按下」比念「标签页 1/4」准确。
 */
function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-xs transition-colors duration-base',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}
