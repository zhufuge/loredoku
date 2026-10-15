import { z } from 'zod';
import {
  CHARACTER_GENDERS,
  DEFAULT_CHARACTER_GENDER,
  DEFAULT_THEME_COLOR,
  EFFECT_COLORS,
  EFFECT_TYPES,
  GRID_SIZE_MAX,
  PARTICIPANT_TARGET_TYPES,
  PARTICIPANT_TRIGGERS,
} from '../constants';
import { normalizeHexColor } from '../color';

const coordSchema = z.number().int().min(0).max(GRID_SIZE_MAX * 4);
const coordTupleSchema = z.tuple([coordSchema, coordSchema]);
const regionIdSchema = z.string().trim().min(1).max(64);

/**
 * MOD-710 (docs/v0.3.2.md): the blue-hue restriction is removed. Any
 * `#RRGGBB` is accepted. The front end provides a non-blocking warning
 * for very high-luminance colours, but the schema does not reject them.
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

export const effectColorSchema = z.enum(EFFECT_COLORS);
/** Reuses the item effect enum; named to avoid clashing with `./item`. */
export const participantEffectTypeSchema = z.enum(EFFECT_TYPES);
export const participantTriggerKeySchema = z.enum(PARTICIPANT_TRIGGERS);
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

export const participantTriggerSchema = z.object({
  trigger: participantTriggerKeySchema,
  targets: z.array(participantTargetSchema),
});

export const participantTriggersSchema = z.array(participantTriggerSchema).default([]);

export type ParticipantTargetInput = z.infer<typeof participantTargetSchema>;
export type ParticipantTriggerInput = z.infer<typeof participantTriggerSchema>;
export type ThemeColorInput = z.infer<typeof themeColorSchema>;

// Re-exported so consumers can build gender pickers from one place.
// CLAR-601: gender is restricted to `male` / `female`.
export const genderSchema = z.enum(CHARACTER_GENDERS).default(DEFAULT_CHARACTER_GENDER);