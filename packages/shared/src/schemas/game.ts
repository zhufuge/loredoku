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
