import { z } from 'zod';
import { bgColorSchema } from './appearance';
import { themeCodeSchema } from './theme';
import {
  CHARACTER_CODE_MAX_LENGTH,
  CHARACTER_CODE_PATTERN,
  CHARACTER_COLOR_PATTERN,
  CHARACTER_DESCRIPTION_MAX_LENGTH,
  CHARACTER_DISPLAY_NAME_MAX,
  CHARACTER_GENDERS,
  CHARACTER_NAME_MAX_LENGTH,
  DEFAULT_CHARACTER_GENDER,
  DEFAULT_THEME_COLOR,
} from '../constants';

export const characterCodeSchema = z
  .string()
  .trim()
  .min(1, '角色编码不能为空')
  .max(CHARACTER_CODE_MAX_LENGTH, `角色编码长度不能超过 ${CHARACTER_CODE_MAX_LENGTH}`)
  .regex(CHARACTER_CODE_PATTERN, '角色编码仅允许字母、数字与下划线');

/**
 * CLAR-601: gender is restricted to `male` / `female`. Missing / null /
 * undefined values are normalised to `male` (default), so callers can never
 * observe `other` / `unknown`.
 */
export const characterGenderSchema = z
  .enum(CHARACTER_GENDERS)
  .default(DEFAULT_CHARACTER_GENDER)
  .describe('角色性别（仅男 / 女，缺省为男）');

/**
 * v0.7.13 (docs/v0.7.13.md §11.4): the 主题色 the character hands to a roster
 * slot — `#RRGGBB`, or `null` for "no default".
 *
 * **`#FFFFFF` is the "no default" value, and is never stored.** The editor has
 * no checkbox: the swatch is always there, so 未指定 needs a colour to show,
 * and white is what the slot falls back to anyway (docs §11.4). Collapsing the
 * two here — rather than in the form — keeps the rule true for every writer,
 * including API clients that never saw the checkbox.
 *
 * The trade: a character genuinely cannot request a white slot. It already had
 * no way to ask for one that differed from "unset", so nothing is lost.
 */
export const characterColorSchema = z
  .string()
  .trim()
  .regex(CHARACTER_COLOR_PATTERN, '颜色需为 #RRGGBB 格式')
  .transform((value) => {
    const upper = value.toUpperCase();
    return upper === DEFAULT_THEME_COLOR ? null : upper;
  })
  .nullable()
  .optional();

/**
 * v0.7.13 (docs/v0.7.13.md §11): the 编号 the character hands to a roster slot.
 *
 * Empty text and `null` are the same thing — "no default, use the sequence
 * number" — so they collapse to `null` here instead of reaching the repository
 * as two different ways of saying nothing.
 */
export const characterDisplayNameSchema = z
  .string()
  .trim()
  .max(CHARACTER_DISPLAY_NAME_MAX, `默认编号不能超过 ${CHARACTER_DISPLAY_NAME_MAX} 个字符`)
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .optional();

export const createCharacterSchema = z.object({
  /** v0.8.0 §19：新建即定边界，必填且用编码 —— 没有默认主题可落。 */
  themeCode: themeCodeSchema,
  code: characterCodeSchema,
  name: z.string().trim().min(1, '角色名称不能为空').max(CHARACTER_NAME_MAX_LENGTH),
  gender: characterGenderSchema,
  description: z.string().trim().max(CHARACTER_DESCRIPTION_MAX_LENGTH).optional().nullable(),
  /** v0.5.1 FEAT-L02: colour-block colour; `null` keeps the image mode. */
  bgColor: bgColorSchema,
  /** v0.7.13: default 主题色 for the roster slot; white = 没有默认值。 */
  color: characterColorSchema,
  /** v0.7.13: default 编号 for the roster slot; `null` = no default. */
  displayName: characterDisplayNameSchema,
  /**
   * v0.5.3 FEAT-N06 (docs/v0.5.3.md §5): enabled right away when the caller
   * already supplies an appearance (avatar or colour block); omitted → `false`.
   */
  isActive: z.boolean().optional(),
});

export const updateCharacterSchema = z
  .object({
    name: z.string().trim().min(1).max(CHARACTER_NAME_MAX_LENGTH).optional(),
    gender: z.enum(CHARACTER_GENDERS).optional(),
    description: z.string().trim().max(CHARACTER_DESCRIPTION_MAX_LENGTH).optional().nullable(),
    /** v0.5.1 FEAT-L02: pass `null` to drop back to the image mode. */
    bgColor: bgColorSchema,
    /** v0.7.13: `null` / 白色 drops the participant default back to white. */
    color: characterColorSchema,
    /** v0.7.13: `null` / `''` drops the 编号 default back to the sequence number. */
    displayName: characterDisplayNameSchema,
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, '请提供需要更新的字段');

export const listCharactersQuerySchema = z.object({
  keyword: z.string().trim().optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  /** §19：按主题编码筛；`undefined` = 全部。 */
  themeCode: themeCodeSchema.optional(),
});

export type CreateCharacterInput = z.infer<typeof createCharacterSchema>;
export type UpdateCharacterInput = z.infer<typeof updateCharacterSchema>;
export type ListCharactersQuery = z.infer<typeof listCharactersQuerySchema>;
