import {
  GAME_DIFFICULTY_COLORS,
  GAME_DIFFICULTY_KEY_MAX_LENGTH,
  GAME_DIFFICULTY_KEY_PATTERN,
  GAME_DIFFICULTY_LEVELS,
  GAME_DIFFICULTY_LABELS_ZH,
  GAME_DIFFICULTY_TEXT_COLORS,
  THEME_DIFFICULTY_TIER_MAX,
} from './constants';
import type { ThemeDifficultyTier } from './types/domain';

/**
 * v0.8.3（docs/v0.8.3.md §3）—— 难度分级从「写死的五档」变成「主题说了算」。
 *
 * 这一层只做三件事，界面与资源包都从这里取，免得「哪几档」「叫什么」「什么色」
 * 三个答案各长一遍：
 *
 * 1. {@link resolveDifficultyTiers}：主题没配就是内置五档 —— 存量主题、存量部署
 *    因此完全不受影响，也不需要迁移数据；
 * 2. {@link difficultyBadge}：一档 → 徽章上的三个值（字、底、前景）；
 * 3. {@link nextDifficultyKey}：概览页「添加一档」时给一个还没被占用的标识。
 *
 * 颜色**不存**在主题里（见 `themeDifficultyTierSchema` 的注释）。徽章底色按这一档
 * 在列表里的**相对位置**落到内置那条五档热力坡上：三档得到「竹青 / 赭黄 / 绛」，
 * 五档恰好一一对应，八档则是两个人共用一格 —— 顺序才是作者说的话。
 */

/** 内置五档：主题没有自定义时就是它。名字用中文（界面其余部分也都是中文）。 */
export const DEFAULT_DIFFICULTY_TIERS: readonly ThemeDifficultyTier[] = GAME_DIFFICULTY_LEVELS.map(
  (key) => ({ key, label: GAME_DIFFICULTY_LABELS_ZH[key] }),
);

/** 主题配了就用配的那几档，否则（缺键 / 空数组）回落到内置五档。 */
export function resolveDifficultyTiers(
  tiers: readonly ThemeDifficultyTier[] | undefined,
): readonly ThemeDifficultyTier[] {
  return tiers && tiers.length > 0 ? tiers : DEFAULT_DIFFICULTY_TIERS;
}

/**
 * 内置那条热力坡上第几格。`Math.round` 而不是向下取整：两端的档必须拿到两端的
 * 颜色（最易=竹青、最难=绛），否则第一档和第二档看起来一样，读者会以为顺序没变。
 */
function rampIndex(position: number, total: number): number {
  if (total <= 1) return 0;
  const last = GAME_DIFFICULTY_LEVELS.length - 1;
  const scaled = Math.round((position * last) / (total - 1));
  return Math.min(last, Math.max(0, scaled));
}

export interface DifficultyBadge {
  label: string;
  /** `hsl(var(--difficulty-*-bg))` 或 `hsl(var(--muted))`。 */
  backgroundColor: string;
  color: string;
}

/**
 * 一个难度标识 → 徽章。**标识不在当前分级里**时不是错误：主题把某一档删掉了，
 * 而库里的游戏还写着它 —— 那时照原样显示标识、给一层中性灰，比硬塞进某一档诚实。
 */
export function difficultyBadge(
  tiers: readonly ThemeDifficultyTier[] | undefined,
  key: string,
): DifficultyBadge {
  const list = resolveDifficultyTiers(tiers);
  const position = list.findIndex((tier) => tier.key === key);
  if (position < 0) {
    return {
      label: key,
      backgroundColor: 'hsl(var(--muted))',
      color: 'hsl(var(--muted-foreground))',
    };
  }
  const level = GAME_DIFFICULTY_LEVELS[rampIndex(position, list.length)]!;
  return {
    label: list[position]!.label,
    backgroundColor: GAME_DIFFICULTY_COLORS[level],
    color: GAME_DIFFICULTY_TEXT_COLORS[level],
  };
}

/** 名字 -> 标识的派生（概览页「添加一档」）。中文标签 slug 化只剩空串，所以用序号。 */
export function nextDifficultyKey(tiers: readonly ThemeDifficultyTier[]): string {
  const taken = new Set(tiers.map((tier) => tier.key));
  for (let index = 1; index <= THEME_DIFFICULTY_TIER_MAX + 1; index += 1) {
    const candidate = `tier-${index}`;
    if (!taken.has(candidate) && GAME_DIFFICULTY_KEY_PATTERN.test(candidate)) return candidate;
  }
  return `tier-${Date.now().toString(36)}`.slice(0, GAME_DIFFICULTY_KEY_MAX_LENGTH);
}

/**
 * 部署弹窗的预选档：主题里还有 `medium` 就用它（与 v0.4 的默认一致），否则取
 * **正中间**那一档。取第一档是不行的 —— 新建一关默认落在「最简单」上，作者
 * 每次都要改。
 */
export function defaultDifficultyKey(tiers: readonly ThemeDifficultyTier[] | undefined): string {
  const list = resolveDifficultyTiers(tiers);
  const medium = list.find((tier) => tier.key === 'medium');
  if (medium) return medium.key;
  return list[Math.floor((list.length - 1) / 2)]?.key ?? 'medium';
}
