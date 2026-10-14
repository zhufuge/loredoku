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
import { isReservedBlueColor } from '../color';

const coordSchema = z.number().int().min(0).max(GRID_SIZE_MAX * 4);
const regionIdSchema = z.string().trim().min(1).max(64);

/** `#RRGGBB` theme colour; blue hues are rejected (reserved for highlights). */
export const themeColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, '主题色需为 #RRGGBB 格式')
  .refine((value) => !isReservedBlueColor(value), '蓝色为高亮专用色，请选择其他颜色')
  .default(DEFAULT_THEME_COLOR);

export const effectColorSchema = z.enum(EFFECT_COLORS);
/** Reuses the item effect enum; named to avoid clashing with `./item`. */
export const participantEffectTypeSchema = z.enum(EFFECT_TYPES);
export const participantTriggerKeySchema = z.enum(PARTICIPANT_TRIGGERS);
export const participantTargetTypeSchema = z.enum(PARTICIPANT_TARGET_TYPES);

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
    effect: participantEffectTypeSchema,
    color: effectColorSchema,
  }),
  z.object({
    type: z.literal('cell'),
    x: coordSchema,
    y: coordSchema,
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
export const genderSchema = z.enum(CHARACTER_GENDERS).default(DEFAULT_CHARACTER_GENDER);
