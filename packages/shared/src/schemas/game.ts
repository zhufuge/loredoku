import { z } from 'zod';
import {
  GAME_DIFFICULTY_LEVEL_MAX,
  GAME_DIFFICULTY_LEVEL_MIN,
  GAME_NAME_MAX_LENGTH,
  GAME_SLUG_MAX_LENGTH,
  GAME_SLUG_PATTERN,
  GAME_SORT_WEIGHT_MAX,
  GAME_SORT_WEIGHT_MIN,
} from '../constants';

/** v0.7.1 §7.2: the row keeps only a cover **path** (the image is served); `clearCover` stays for OPT-W03's keep / replace / remove. */
export const gameDeploySchema = z.object({
  name: z
    .string()
    .trim()
    .max(GAME_NAME_MAX_LENGTH, `游戏名称最多 ${GAME_NAME_MAX_LENGTH} 个字符`)
    .optional(),
  slug: z
    .string()
    .trim()
    .max(GAME_SLUG_MAX_LENGTH, `访问路径最多 ${GAME_SLUG_MAX_LENGTH} 个字符`)
    .optional(),
  /** OPT-W03 §3: explicit "remove the cover" — no cover bytes are involved. */
  clearCover: z.boolean().optional(),
  /** 路径已被别的谜题版本占着时**覆盖**它：不传 = 冲突即 400，传 true = 假删占位那条再落自己的。 */
  overwriteSlug: z.boolean().optional(),
  /** 难度档位数字（只验 1…99 整数，档位是否存在于该主题由服务端核对）；**不给 `.default()`** —— 缺省档取决于主题，写死 3 会让两档主题部署失败。 */
  difficulty: z
    .number()
    .int('难度必须是整数档位')
    .min(GAME_DIFFICULTY_LEVEL_MIN)
    .max(GAME_DIFFICULTY_LEVEL_MAX)
    .optional(),
  /** 展示顺序：**升序**，同权重按路径。缺省 ≠ 0（缺省沿用上一行，显式 0 才是排 0），故不给 `.default()`。 */
  sortWeight: z.number().int().min(GAME_SORT_WEIGHT_MIN).max(GAME_SORT_WEIGHT_MAX).optional(),
});

/** 部署页就地改权重（`PATCH /api/games/:id`）：这里 `sortWeight` **必填**，缺键不能静默成功。 */
export const gameWeightUpdateSchema = z.object({
  sortWeight: z.number().int().min(GAME_SORT_WEIGHT_MIN).max(GAME_SORT_WEIGHT_MAX),
});

/** SPEC-G01 (docs/v0.4.0.md §7.1)：放置层一格，三种形态互斥（`participant` / `numbers` / `forbidden`），`null` 为空。 */
export const cellPlacementSchema = z.union([
  z.object({
    kind: z.literal('participant'),
    index: z.number().int().min(1),
  }),
  z.object({
    kind: z.literal('numbers'),
    entries: z.array(z.number().int().min(1)),
  }),
  z.object({
    kind: z.literal('forbidden'),
    /** 该 `×` 是同行同列的**自动补白**（不是玩家点的）：搬家回滚靠它区分，手动放的 `×` 不带它。 */
    auto: z.boolean().optional(),
  }),
]);

export type CellPlacement = z.infer<typeof cellPlacementSchema>;

/** A full board of placements, keyed `"x,y"` — only non-empty cells are kept. */
export const gamePlacementBoardSchema = z.record(
  z.string(),
  cellPlacementSchema.nullable(),
);

/** 显式写出而非由 schema 推导：zod 的 record 推断会在 `noUncheckedIndexedAccess` 下多带 `undefined`，调用方还得再收窄。 */
export type GamePlacementBoard = Record<string, CellPlacement | null>;

export type GameDeployInput = z.infer<typeof gameDeploySchema>;

/** 「访问路径已被占用」的结构化说明：前端要弹带**覆盖**按钮的弹窗，须知道被占路径与占位游戏，不能靠正则匹配消息。 */
export interface GameSlugConflict {
  kind: 'slug-taken';
  slug: string;
  /** 占位那条部署的游戏名。 */
  name: string;
  /** 它来自哪个谜题。 */
  puzzleName: string;
}

/** 任意 `error.details` → 冲突说明；不是冲突就 `null`。 */
export function asGameSlugConflict(value: unknown): GameSlugConflict | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const candidate = value as Partial<GameSlugConflict>;
  if (candidate.kind !== 'slug-taken') return null;
  if (typeof candidate.slug !== 'string') return null;
  return {
    kind: 'slug-taken',
    slug: candidate.slug,
    name: typeof candidate.name === 'string' ? candidate.name : candidate.slug,
    puzzleName: typeof candidate.puzzleName === 'string' ? candidate.puzzleName : '',
  };
}

/** OPT-W04 §4.6：路径段与部署用同一字符集，畸形 URL 在查库前就 404。 */
export const gameSlugParamSchema = z.object({
  slug: z
    .string()
    .trim()
    .max(GAME_SLUG_MAX_LENGTH)
    .regex(GAME_SLUG_PATTERN, '访问路径不合法'),
});
