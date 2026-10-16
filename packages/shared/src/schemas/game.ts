import { z } from 'zod';
import {
  GAME_DIFFICULTY_DEFAULT,
  GAME_DIFFICULTY_LEVELS,
  GAME_NAME_MAX_LENGTH,
  GAME_SLUG_MAX_LENGTH,
  GAME_SLUG_PATTERN,
} from '../constants';
import { mapDraftSchema, characterSlotEntrySchema, mapLinkageColorSchema } from './mapDraft';
import { puzzleDraftSchema } from './puzzle';

/**
 * FEAT-G02 (docs/v0.4.0.md §5.2) + OPT-W04 (docs/v0.4.1.md §4): the deploy
 * dialog body. The name defaults to the puzzle name but is editable, the access
 * path defaults to `puzzle-{name}-{difficulty}` but is editable, the cover is
 * optional, and the difficulty is one of five tiers.
 *
 * v0.5.0 CONS-K16: **no `versionNo`** — the unit being deployed is a puzzle,
 * and a puzzle pins the map version it draws on, so the route already knows it.
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
  coverPath: z.string().trim().min(1).nullish(),
  coverMime: z.string().trim().min(1).nullish(),
  coverSize: z.number().int().nonnegative().nullish(),
  coverWidth: z.number().int().nonnegative().nullish(),
  coverHeight: z.number().int().nonnegative().nullish(),
  difficulty: z
    .enum(GAME_DIFFICULTY_LEVELS)
    .default(GAME_DIFFICULTY_DEFAULT),
});

/**
 * CONS-K16 (docs/v0.5.0.md §10.1): the frozen payload a game renders, in its
 * **normalised** form — the server lifts a legacy roster out of the map part
 * before storing / serving it, so this schema describes what the game page
 * actually receives.
 */
export const mapGameSnapshotSchema = z
  .object({
    map: mapDraftSchema,
    puzzle: puzzleDraftSchema.nullable(),
    /** v0.4.x compatibility: the roster used to live inside the map draft. */
    legacyCharacterSlots: z.array(characterSlotEntrySchema.nullable()).optional(),
    /** v0.4.x compatibility: the palette used to live in `map.style`. */
    legacyLinkageColors: z.array(mapLinkageColorSchema).optional(),
  })
  .strict();

export type MapGameSnapshotInput = z.infer<typeof mapGameSnapshotSchema>;

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
