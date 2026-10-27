import { z } from 'zod';
import {
  GAME_DIFFICULTY_DEFAULT,
  GAME_DIFFICULTY_LEVELS,
  GAME_NAME_MAX_LENGTH,
  GAME_SLUG_MAX_LENGTH,
  GAME_SLUG_PATTERN,
} from '../constants';

/**
 * v0.7.1 §7.2: the game row only keeps a cover **path** — mime / size / the two
 * dimensions are gone (the image is served, not re-rendered). `clearCover` stays
 * because OPT-W03's keep / replace / remove trichotomy is still the dialog's
 * behaviour.
 */
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
  /**
   * v0.7.11：访问路径已被别的谜题版本占着时，**覆盖**它。
   *
   * 部署页的路径冲突原先只回一句「已被占用，请更换」—— 作者真正想要的往往是
   * 「这条链接就归我」，于是只能先去部署页把对方撤掉再回来重试。这个开关让冲突
   * 变成一次选择：不传真（照旧 400），传真则把占位的那条部署假删后再落自己的。
   */
  overwriteSlug: z.boolean().optional(),
  difficulty: z
    .enum(GAME_DIFFICULTY_LEVELS)
    .default(GAME_DIFFICULTY_DEFAULT),
});

/**
 * SPEC-G01 (docs/v0.4.0.md §7.1): what one cell of the 游戏放置层 holds.
 * The three forms are mutually exclusive; `null` is an empty cell.
 *
 * - `participant` — the participant's picture (`index` is the 1-based slot
 *   number shown on the roster card);
 * - `numbers` — an ordered list of participant numbers laid out in a 3×3
 *   sub-grid (at most nine, left-to-right / top-to-bottom);
 * - `forbidden` — the black `×`, which also activates the non-standable mask.
 */
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
    /**
     * v0.7.11：这个 `×` 是**同行同列的自动补白**，不是玩家自己点的。
     *
     * 头像可以整格搬走（长按另一格），搬走之后旧行旧列的自动 `×` 就成了谎话 ——
     * 有了这个标记，「哪些能跟着回滚」不再靠猜。玩家手动放的 `×` 不带它，
     * 搬家时一律不动。
     */
    auto: z.boolean().optional(),
  }),
]);

export type CellPlacement = z.infer<typeof cellPlacementSchema>;

/** A full board of placements, keyed `"x,y"` — only non-empty cells are kept. */
export const gamePlacementBoardSchema = z.record(
  z.string(),
  cellPlacementSchema.nullable(),
);

/**
 * Written explicitly rather than inferred from `gamePlacementBoardSchema`:
 * zod's record inference widens values to `… | undefined` under
 * `noUncheckedIndexedAccess`, which every caller then has to re-narrow.
 */
export type GamePlacementBoard = Record<string, CellPlacement | null>;

export type GameDeployInput = z.infer<typeof gameDeploySchema>;

/**
 * v0.7.11：部署时「访问路径已被占用」这一种错误的结构化说明。
 *
 * 放进 `error.details` 而不是只留一句中文 —— 前端要弹一个带**覆盖**按钮的
 * 弹窗，它得知道被占的是哪条路径、占位的是哪个游戏，才说得清「覆盖谁」。
 * 靠正则匹配消息文本做这件事，是迟早会坏掉的做法。
 */
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

/**
 * OPT-W04 §4.6: `GET /api/games/slug/:slug`. The path segment is validated
 * with the same character set the deploy enforces, so a malformed URL 404s
 * instead of reaching the database.
 */
export const gameSlugParamSchema = z.object({
  slug: z
    .string()
    .trim()
    .max(GAME_SLUG_MAX_LENGTH)
    .regex(GAME_SLUG_PATTERN, '访问路径不合法'),
});
