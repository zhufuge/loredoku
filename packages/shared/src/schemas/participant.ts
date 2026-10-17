import { z } from 'zod';
import {
  CHARACTER_GENDERS,
  DEFAULT_CHARACTER_GENDER,
  DEFAULT_THEME_COLOR,
  EFFECT_TYPES,
  GRID_SIZE_MAX,
  LINKAGE_COLOR_KEY_PATTERN,
  PARTICIPANT_TARGET_TYPES,
} from '../constants';
import { normalizeHexColor } from '../color';

const coordSchema = z.number().int().min(0).max(GRID_SIZE_MAX * 4);
const coordTupleSchema = z.tuple([coordSchema, coordSchema]);
const regionIdSchema = z.string().trim().min(1).max(64);

/**
 * MOD-710 (docs/v0.3.2.md): the blue-hue restriction is removed.
 * MOD-801 (docs/v0.3.3.md): the high-luminance warning is removed too —
 * any `#RRGGBB` is accepted with no hints or blocking.
 */
export const themeColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, '主题色需为 #RRGGBB 格式')
  .refine(
    (value) => normalizeHexColor(value) !== null,
    '主题色需为 #RRGGBB 格式',
  )
  .default(DEFAULT_THEME_COLOR);

/**
 * v0.3.8 FEAT-D04: a linkage colour is the **key** of an entry in the puzzle's
 * linkage palette. The key format is validated here; the "key must exist"
 * cross-check lives in `puzzleRefs` (it needs the whole draft).
 */
export const effectColorSchema = z
  .string()
  .trim()
  .regex(LINKAGE_COLOR_KEY_PATTERN, '联动主题色 key 需为小写字母开头的标识符');
/** Reuses the item effect enum; named to avoid clashing with `./item`. */
export const participantEffectTypeSchema = z.enum(EFFECT_TYPES);
export const participantTargetTypeSchema = z.enum(PARTICIPANT_TARGET_TYPES);

/**
 * MOD-708 (docs/v0.3.2.md): cell targets carry a `cells` array instead of
 * a single {x, y}. Item targets gain a `scope` field.
 */
export const participantTargetSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('character'),
    id: z.number().int().positive(),
    effect: participantEffectTypeSchema,
    color: effectColorSchema,
  }),
  z.object({
    type: z.literal('item'),
    id: z.number().int().positive(),
    scope: z.enum(['all', 'instances']).default('all'),
    instances: z.array(coordTupleSchema).optional(),
    effect: participantEffectTypeSchema,
    color: effectColorSchema,
  }),
  z.object({
    type: z.literal('cell'),
    cells: z.array(coordTupleSchema).min(1),
    effect: participantEffectTypeSchema,
    color: effectColorSchema,
  }),
  z.object({
    type: z.literal('region'),
    id: regionIdSchema,
    effect: participantEffectTypeSchema,
    color: effectColorSchema,
  }),
]);

/**
 * MOD-801 (docs/v0.3.3.md): the click/touch grouping is gone. A slot keeps
 * one flat, de-duplicated list of linkages; hover and click both play the
 * whole list (MOD-802).
 */
export const participantLinkagesSchema = z.array(participantTargetSchema).default([]);

export type ParticipantTargetInput = z.infer<typeof participantTargetSchema>;
export type ParticipantLinkagesInput = z.infer<typeof participantLinkagesSchema>;
export type ThemeColorInput = z.infer<typeof themeColorSchema>;

// Re-exported so consumers can build gender pickers from one place.
// CLAR-601: gender is restricted to `male` / `female`.
export const genderSchema = z.enum(CHARACTER_GENDERS).default(DEFAULT_CHARACTER_GENDER);