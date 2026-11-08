import type { ThemeDifficultyTier } from '@loredoku/shared';
import { difficultyBadge } from '@loredoku/shared';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
import { cn } from '@/lib/utils';

interface DifficultyBadgeProps {
  /** `games.difficulty` —— 档位数字（1 起，越大越难）。 */
  difficulty: number;
  className?: string;
  /**
   * 显式给分级。默认读当前工作空间的主题 —— 游戏卡、部署页、导出清单都在工作
   * 空间里，那里就是唯一真相；单独渲染（测试、播放页之外的地方）可以显式传。
   */
  tiers?: readonly ThemeDifficultyTier[];
}

/**
 * v0.8.3（docs/v0.8.3.md §3.4）：难度徽章。
 *
 * 以前这里（以及部署页、导出清单、部署弹窗）各自 `GAME_DIFFICULTY_COLORS[key]` ——
 * 四份同样的三行代码，四份都假设「档位只有那五个」。收成一个组件之后，取色只剩
 * `difficultyBadge` 一处：没选色的档按位置落在内置坡上，选了色的档由那颗色混出
 * 淡底与深字（v0.8.6）。
 */
export function DifficultyBadge({
  difficulty,
  className,
  tiers,
}: DifficultyBadgeProps): JSX.Element {
  const workspace = useWorkspace();
  const badge = difficultyBadge(tiers ?? workspace?.theme.data.difficultyLevels, difficulty);
  return (
    <span
      className={cn('shrink-0 rounded-full px-2 py-0.5 text-2xs font-medium', className)}
      style={{ backgroundColor: badge.backgroundColor, color: badge.color }}
    >
      {badge.label}
    </span>
  );
}
