import {
  GAME_DIFFICULTY_COLORS,
  GAME_DIFFICULTY_DEFAULT_LEVEL,
  GAME_DIFFICULTY_LABELS_ZH,
  GAME_DIFFICULTY_LEVELS,
  GAME_DIFFICULTY_LEVEL_MAX,
  GAME_DIFFICULTY_RAMP_HEX,
  GAME_DIFFICULTY_TEXT_COLORS,
} from './constants';
import type { ThemeDifficultyTier } from './types/domain';

/** v0.8.6（docs/v0.8.6.md §3）：难度是数字档位。{@link resolveDifficultyTiers} 恒返回按 `level` 升序的列表（主题没配就用内置五档）；徽章取色：档上有 `color` 就混色，否则按相对位置落内置热力坡，存量主题不必补数据。 */

/** 内置五档：主题没有自定义时就是它。`level` 从 1 起，越大越难。 */
export const DEFAULT_DIFFICULTY_TIERS: readonly ThemeDifficultyTier[] = GAME_DIFFICULTY_LEVELS.map(
  (key, index) => ({ level: index + 1, label: GAME_DIFFICULTY_LABELS_ZH[key] }),
);

/** 主题配了就用配的那几档，否则（缺键 / 空数组）回落到内置五档。 返回**按 `level` 升序的副本**：存进 `themes.data` 的顺序不该是可信的 —— 库里那份 JSON 谁都能手改，而「第 2 档排在第 1 档前面」这种数据没有任何一处会报错， 只会让徽章的坡取错颜色。排序放在这里，取色与列表就永远同一顺序。 */
export function resolveDifficultyTiers(
  tiers: readonly ThemeDifficultyTier[] | undefined,
): readonly ThemeDifficultyTier[] {
  if (!tiers || tiers.length === 0) return DEFAULT_DIFFICULTY_TIERS;
  return [...tiers].sort((left, right) => left.level - right.level);
}

/** 内置那条热力坡上第几格。`Math.round` 而不是向下取整：两端的档必须拿到两端的颜色（最易=竹青、最难=绛），否则第一档和第二档看起来一样，读者会以为顺序没变。 */
export function difficultyRampIndex(position: number, total: number): number {
  if (total <= 1) return 0;
  const last = GAME_DIFFICULTY_LEVELS.length - 1;
  const scaled = Math.round((position * last) / (total - 1));
  return Math.min(last, Math.max(0, scaled));
}

export interface DifficultyBadge {
  label: string;
  /** `hsl(var(--difficulty-*-bg))`、`color-mix(...)` 或 `hsl(var(--muted))`。 */
  backgroundColor: string;
  color: string;
}

/** 一颗自定义色 → 徽章两值（徽章是淡底 + 同色相的字）：底色 = 20% 这颗色 + `--card`，字色 = 42% 这颗色 + `--foreground` —— 混的是 token，所以浅色/深色自动各取各的，不用存两份颜色。 */
export function difficultyBadgeFromColor(hex: string): Pick<DifficultyBadge, 'backgroundColor' | 'color'> {
  return {
    backgroundColor: `color-mix(in srgb, ${hex} 20%, hsl(var(--card)))`,
    color: `color-mix(in srgb, ${hex} 42%, hsl(var(--foreground)))`,
  };
}

/** 一个档位数字 → 徽章。 **数字不在当前分级里**时不是错误：主题把某一档删掉了，而库里的游戏还写着它 —— 那时显示「第 N 档」+ 一层中性灰，比硬塞进某一档诚实。 */
export function difficultyBadge(
  tiers: readonly ThemeDifficultyTier[] | undefined,
  level: number,
): DifficultyBadge {
  const list = resolveDifficultyTiers(tiers);
  const position = list.findIndex((tier) => tier.level === level);
  if (position < 0) {
    return {
      label: `第 ${level} 档`,
      backgroundColor: 'hsl(var(--muted))',
      color: 'hsl(var(--muted-foreground))',
    };
  }
  const tier = list[position]!;
  if (tier.color) {
    return { label: tier.label, ...difficultyBadgeFromColor(tier.color) };
  }
  const rampLevel = GAME_DIFFICULTY_LEVELS[difficultyRampIndex(position, list.length)]!;
  return {
    label: tier.label,
    backgroundColor: GAME_DIFFICULTY_COLORS[rampLevel],
    color: GAME_DIFFICULTY_TEXT_COLORS[rampLevel],
  };
}

/** 取色器在「这一档还没选过色」时显示的色 —— 就是徽章此刻正在用的那颗。 */
export function difficultySwatchColor(
  tiers: readonly ThemeDifficultyTier[],
  level: number,
): string {
  const list = resolveDifficultyTiers(tiers);
  const position = list.findIndex((tier) => tier.level === level);
  if (position < 0) return GAME_DIFFICULTY_RAMP_HEX[0];
  const tier = list[position]!;
  if (tier.color) return tier.color;
  return GAME_DIFFICULTY_RAMP_HEX[difficultyRampIndex(position, list.length)]!;
}

/** 部署弹窗的预选档：主题里还有**第 3 档**就用它（与 v0.4 的默认一致），否则取 **正中间**那一档。取第一档是不行的 —— 新建一关默认落在「最简单」上，作者每次都要改。 */
export function defaultDifficultyLevel(tiers: readonly ThemeDifficultyTier[] | undefined): number {
  const list = resolveDifficultyTiers(tiers);
  const medium = list.find((tier) => tier.level === GAME_DIFFICULTY_DEFAULT_LEVEL);
  if (medium) return medium.level;
  return list[Math.floor((list.length - 1) / 2)]?.level ?? GAME_DIFFICULTY_DEFAULT_LEVEL;
}

/** 「添加一档」时给的数字：接在最大的一档后面。 不补空档（比如删掉第 3 档后新建就拿 3）—— 那个数字可能还被某条部署指着，补上去等于让一条旧关卡莫名换了难度。接在最后，新档只可能「没人用过」。 */
export function nextDifficultyLevel(tiers: readonly ThemeDifficultyTier[]): number {
  const highest = tiers.reduce((max, tier) => Math.max(max, tier.level), 0);
  const next = highest + 1;
  if (next <= GAME_DIFFICULTY_LEVEL_MAX) return next;
  const taken = new Set(tiers.map((tier) => tier.level));
  for (let level = 1; level <= GAME_DIFFICULTY_LEVEL_MAX; level += 1) {
    if (!taken.has(level)) return level;
  }
  return GAME_DIFFICULTY_LEVEL_MAX;
}
