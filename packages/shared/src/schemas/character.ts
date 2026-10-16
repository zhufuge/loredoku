import { z } from 'zod';
import { bgColorSchema } from './appearance';
import {
  CHARACTER_CODE_MAX_LENGTH,
  CHARACTER_CODE_PATTERN,
  CHARACTER_DESCRIPTION_MAX_LENGTH,
  CHARACTER_GENDERS,
  CHARACTER_NAME_MAX_LENGTH,
  DEFAULT_CHARACTER_GENDER,
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

export const createCharacterSchema = z.object({
  code: characterCodeSchema,
  name: z.string().trim().min(1, '角色名称不能为空').max(CHARACTER_NAME_MAX_LENGTH),
  gender: characterGenderSchema,
  description: z.string().trim().max(CHARACTER_DESCRIPTION_MAX_LENGTH).optional().nullable(),
  /** v0.5.1 FEAT-L02: colour-block colour; `null` keeps the image mode. */
  bgColor: bgColorSchema,
  /**
   * v0.5.3 FEAT-N06 (docs/v0.5.3.md §5): enabled right away when the caller
   * already supplies an appearance (avatar or colour block); omitted → `false`.
   */
  isActive: z.boolean().optional(),
  meta: z.record(z.unknown()).default({}),
});

export const updateCharacterSchema = z
  .object({
    name: z.string().trim().min(1).max(CHARACTER_NAME_MAX_LENGTH).optional(),
    gender: z.enum(CHARACTER_GENDERS).optional(),
    description: z.string().trim().max(CHARACTER_DESCRIPTION_MAX_LENGTH).optional().nullable(),
    /** v0.5.1 FEAT-L02: pass `null` to drop back to the image mode. */
    bgColor: bgColorSchema,
    meta: z.record(z.unknown()).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, '请提供需要更新的字段');

export const listCharactersQuerySchema = z.object({
  keyword: z.string().trim().optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

export type CreateCharacterInput = z.infer<typeof createCharacterSchema>;
export type UpdateCharacterInput = z.infer<typeof updateCharacterSchema>;
export type ListCharactersQuery = z.infer<typeof listCharactersQuerySchema>;
