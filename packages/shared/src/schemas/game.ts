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
  /**
   * v0.8.6：难度是**档位数字**（v0.8.3 时是字符串标识）。schema 只知道「一个
   * 1…99 的整数」，至于这个数字在这个主题里存不存在，由服务端拿着主题去核对 ——
   * schema 不认识数据库，而这一步必须知道是哪个主题。
   *
   * **不给 `.default()`**：缺省档取决于主题（内置五档里是第 3 档，自定义分级里
   * 是「正中间那一档」）。schema 里写死 3，一个只有两档的主题就会因为默认值不在
   * 自己的分级里而部署失败 —— 而作者根本没提难度。
   */
  difficulty: z
    .number()
    .int('难度必须是整数档位')
    .min(GAME_DIFFICULTY_LEVEL_MIN)
    .max(GAME_DIFFICULTY_LEVEL_MAX)
    .optional(),
  /**
   * v0.8.3：展示顺序 —— **升序**，数字小的排前面，同权重按访问路径。
   *
   * 缺省（`undefined`）与「显式给 0」要分开：前者是「这次没提这件事」，服务端
   * 沿用上一行的值（重新部署不该把作者排好的顺序悄悄清零）；后者是「就排 0」。
   * 所以这里不给 `.default()` —— 一个把两者抹平的默认值，会让每次部署都重排一次。
   */
  sortWeight: z.number().int().min(GAME_SORT_WEIGHT_MIN).max(GAME_SORT_WEIGHT_MAX).optional(),
});

/**
 * v0.8.5：部署页就地改权重（`PATCH /api/games/:id`）。
 *
 * 与 `gameDeploySchema.sortWeight` 的区别只有一条：那里**缺省**是「这次没提」，
 * 这里 `sortWeight` 是**必填** —— 这条端点的唯一职责就是改它，少一个键的请求
 * 没有别的意思可表达，静默成功只会让作者以为改上了。
 */
export const gameWeightUpdateSchema = z.object({
  sortWeight: z.number().int().min(GAME_SORT_WEIGHT_MIN).max(GAME_SORT_WEIGHT_MAX),
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
