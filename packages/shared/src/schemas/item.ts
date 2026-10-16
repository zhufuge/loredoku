import { z } from 'zod';
import { canStandFor } from '../itemRules';
import { bgColorSchema } from './appearance';
import {
  DEFAULT_ITEM_CATEGORY,
  DEFAULT_ITEM_FIT_MODE,
  EFFECT_TYPES,
  ITEM_CATEGORIES,
  ITEM_CODE_MAX_LENGTH,
  ITEM_CODE_PATTERN,
  ITEM_FIT_MODES,
  ITEM_NAME_MAX_LENGTH,
  ITEM_SIZE_DEFAULT,
  ITEM_SIZE_MAX,
  ITEM_SIZE_MIN,
} from '../constants';

export const effectTypeSchema = z.enum(EFFECT_TYPES);

/**
 * v0.5.2 SPEC-M06 (docs/v0.5.2.md §6): the image fill mode is **in use** —
 * `MapLayers` reads it for `object-fit` on both the background and the object
 * layer — so it stays.
 */
export const itemFitModeSchema = z.enum(ITEM_FIT_MODES);

export const itemCodeSchema = z
  .string()
  .trim()
  .min(1, '业务 ID 不能为空')
  .max(ITEM_CODE_MAX_LENGTH, `业务 ID 长度不能超过 ${ITEM_CODE_MAX_LENGTH}`)
  .regex(ITEM_CODE_PATTERN, '业务 ID 仅允许字母、数字与下划线');

export const itemCategorySchema = z.enum(ITEM_CATEGORIES);

export const itemSizeSchema = z.number().int().min(ITEM_SIZE_MIN).max(ITEM_SIZE_MAX);

/**
 * v0.5.2 FEAT-M03: the free-form `meta` blob and the whole trigger feature are
 * gone — §3.1 lists every symbol that went with them.
 *
 * v0.5.2 FEAT-M04: both schemas normalise `canStand` through `canStandFor`, so
 * a background item is standable no matter what the caller sent.
 */
export const createItemSchema = z
  .object({
    code: itemCodeSchema,
    name: z.string().trim().min(1, '物品名称不能为空').max(ITEM_NAME_MAX_LENGTH),
    category: itemCategorySchema.default(DEFAULT_ITEM_CATEGORY),
    widthCells: itemSizeSchema.default(ITEM_SIZE_DEFAULT),
    heightCells: itemSizeSchema.default(ITEM_SIZE_DEFAULT),
    canStand: z.boolean().default(true),
    fitMode: itemFitModeSchema.default(DEFAULT_ITEM_FIT_MODE),
    /** v0.5.1 FEAT-L01: colour-block colour; `null` keeps the image mode. */
    bgColor: bgColorSchema,
  })
  .transform((value) => ({ ...value, canStand: canStandFor(value.category, value.canStand) }));

export const updateItemSchema = z
  .object({
    name: z.string().trim().min(1).max(ITEM_NAME_MAX_LENGTH).optional(),
    category: itemCategorySchema.optional(),
    widthCells: itemSizeSchema.optional(),
    heightCells: itemSizeSchema.optional(),
    canStand: z.boolean().optional(),
    fitMode: itemFitModeSchema.optional(),
    /** v0.5.1 FEAT-L01: pass `null` to drop back to the image mode. */
    bgColor: bgColorSchema,
    isActive: z.boolean().optional(),
  })
  .transform((value) =>
    value.canStand === undefined
      ? value
      : { ...value, canStand: canStandFor(value.category ?? DEFAULT_ITEM_CATEGORY, value.canStand) },
  );

export const listItemsQuerySchema = z.object({
  keyword: z.string().trim().optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  category: itemCategorySchema.optional(),
});

export type CreateItemInput = z.infer<typeof createItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
export type ListItemsQuery = z.infer<typeof listItemsQuerySchema>;
