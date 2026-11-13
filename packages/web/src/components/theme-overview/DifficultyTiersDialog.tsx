import { useEffect, useState } from 'react';
import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import {
  DEFAULT_DIFFICULTY_TIERS,
  THEME_DIFFICULTY_TIER_MAX,
  difficultySwatchColor,
  nextDifficultyLevel,
  resolveDifficultyTiers,
  type Theme,
  type ThemeDifficultyTier,
} from '@loredoku/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ColorField } from '@/components/ui/color-input';
import { IconButton } from '@/components/ui/icon-button';
import { DifficultyBadge } from '@/components/game/DifficultyBadge';
import { useUpdateTheme } from '@/hooks/useThemes';

/**
 * v0.8.6 §3：难度分级。
 *
 * 一档 = **数字 + 名字 + 可选颜色**。
 *
 * 数字落进 `games.difficulty`，所以**不给改**：库里那些关只记得数字，改一次就
 * 全对不上了。它同时是顺序 —— 列表按它排，删掉中间一档也不必给后面重新编号
 * （重编号等于把已经在用的关卡集体搬走）。新档的数字接在最大一档后面。
 *
 * 颜色可以不给：不给就按位置落在内置五档那条热力坡上，存量主题因此一个像素都
 * 不变；给了就是一颗 `#rrggbb`，徽章拿它混出淡底与深字（浅色、深色界面各取各的）。
 *
 * 「恢复内置五档」= 把 `difficultyLevels` 这个键删掉，回到「没配过」的状态 ——
 * 比写一份和内置一模一样的数组干净：以后内置改了，这类主题跟着改。
 */
export function DifficultyTiersDialog({
  theme,
  open,
  onOpenChange,
}: {
  theme: Theme;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): JSX.Element {
  const [tiers, setTiers] = useState<ThemeDifficultyTier[]>(() =>
    [...resolveDifficultyTiers(theme.data.difficultyLevels)],
  );
  const update = useUpdateTheme(theme.code);

  useEffect(() => {
    if (!open) return;
    setTiers([...resolveDifficultyTiers(theme.data.difficultyLevels)]);
  }, [open, theme.data.difficultyLevels]);

  /** 只改名字 / 颜色 —— 档位数字是身份，界面上根本不给改。 */
  const patch = (level: number, next: Partial<ThemeDifficultyTier>): void => {
    setTiers((current) =>
      current.map((row) => (row.level === level ? { ...row, ...next } : row)),
    );
  };

  async function submit(): Promise<void> {
    const data: Record<string, unknown> = { ...theme.data };
    /**
     * 「和内置五档一模一样」才删键 —— 名字和**颜色**都要比。
     *
     * v0.8.3 的第一版只比标识，于是「把『极简』改名叫『入门』」会被判成「还是
     * 内置五档」，保存后名字又变回「极简」。v0.8.6 加了颜色，同一个坑再多一维：
     * 只改了颜色的档，删掉键之后颜色也跟着没了。
     */
    const isBuiltIn =
      tiers.length === DEFAULT_DIFFICULTY_TIERS.length &&
      tiers.every((tier, index) => {
        const builtin = DEFAULT_DIFFICULTY_TIERS[index];
        return (
          builtin !== undefined &&
          tier.level === builtin.level &&
          tier.label === builtin.label &&
          tier.color === undefined
        );
      });
    if (isBuiltIn) delete data['difficultyLevels'];
    else data['difficultyLevels'] = tiers;
    try {
      await update.mutateAsync({ data });
    } catch {
      return;
    }
    onOpenChange(false);
  }

  const tooFew = tiers.length === 0;
  const tooMany = tiers.length >= THEME_DIFFICULTY_TIER_MAX;
  const nextLevel = nextDifficultyLevel(tiers);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>难度分级 · {theme.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-2xs leading-relaxed text-muted-foreground">
            数字是档位，落库的就是它，越大越难；名字与颜色只影响展示。颜色不改就沿用内置那五档的坡。
          </p>

          <ul className="space-y-2">
            {tiers.map((tier) => (
              <li key={tier.level} className="flex items-center gap-2">
                <span
                  className="w-5 shrink-0 text-center font-mono text-2xs text-muted-foreground"
                  title={`第 ${tier.level} 档`}
                >
                  {tier.level}
                </span>
                <DifficultyBadge difficulty={tier.level} tiers={tiers} className="w-14 justify-center text-center" />
                <Input
                  value={tier.label}
                  aria-label={`第 ${tier.level} 档名称`}
                  maxLength={12}
                  onChange={(event) => patch(tier.level, { label: event.target.value })}
                  className="h-8 flex-1 text-sm"
                />
                <ColorField
                  value={difficultySwatchColor(tiers, tier.level)}
                  label={`第 ${tier.level} 档颜色`}
                  commit={(color) => patch(tier.level, { color })}
                />
                <IconButton
                  icon={<RotateCcw className="h-3.5 w-3.5" />}
                  label="恢复默认色"
                  variant="ghost"
                  className="h-7 w-7 text-muted-foreground"
                  disabled={tier.color === undefined}
                  onClick={() => patch(tier.level, { color: undefined })}
                />
                <IconButton
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                  label="删除这一档"
                  variant="ghost"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  disabled={tiers.length <= 1}
                  onClick={() =>
                    setTiers((current) => current.filter((row) => row.level !== tier.level))
                  }
                />
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={tooMany}
              onClick={() =>
                setTiers((current) => [
                  ...current,
                  { level: nextLevel, label: `第 ${nextLevel} 档` },
                ])
              }
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              添加一档
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => setTiers([...DEFAULT_DIFFICULTY_TIERS])}
            >
              恢复内置五档
            </Button>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button
              onClick={() => void submit()}
              disabled={tooFew || update.isPending || tiers.some((tier) => tier.label.trim().length === 0)}
            >
              {update.isPending ? '保存中…' : '保存'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
