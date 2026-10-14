import { z } from 'zod';
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

export const itemFitModeSchema = z.enum(ITEM_FIT_MODES);

export const itemTriggerInputSchema = z.object({
  triggerKey: z.string().trim().min(1, '触发器 Key 不能为空').max(64),
  triggerValue: z.string().trim().min(1, '触发值不能为空').max(255),
  effectType: effectTypeSchema,
  effectConfig: z.record(z.unknown()).default({}),
});

export const itemCodeSchema = z
  .string()
  .trim()
  .min(1, '业务 ID 不能为空')
  .max(ITEM_CODE_MAX_LENGTH, `业务 ID 长度不能超过 ${ITEM_CODE_MAX_LENGTH}`)
  .regex(ITEM_CODE_PATTERN, '业务 ID 仅允许字母、数字与下划线');

export const itemCategorySchema = z.enum(ITEM_CATEGORIES);

export const itemSizeSchema = z.number().int().min(ITEM_SIZE_MIN).max(ITEM_SIZE_MAX);

export const createItemSchema = z.object({
  code: itemCodeSchema,
  name: z.string().trim().min(1, '物品名称不能为空').max(ITEM_NAME_MAX_LENGTH),
  category: itemCategorySchema.default(DEFAULT_ITEM_CATEGORY),
  widthCells: itemSizeSchema.default(ITEM_SIZE_DEFAULT),
  heightCells: itemSizeSchema.default(ITEM_SIZE_DEFAULT),
  canStand: z.boolean().default(true),
  fitMode: itemFitModeSchema.default(DEFAULT_ITEM_FIT_MODE),
  meta: z.record(z.unknown()).default({}),
  triggers: z.array(itemTriggerInputSchema).default([]),
});

export const updateItemSchema = z.object({
  name: z.string().trim().min(1).max(ITEM_NAME_MAX_LENGTH).optional(),
  category: itemCategorySchema.optional(),
  widthCells: itemSizeSchema.optional(),
  heightCells: itemSizeSchema.optional(),
  canStand: z.boolean().optional(),
  fitMode: itemFitModeSchema.optional(),
  meta: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

export const replaceItemTriggersSchema = z.array(itemTriggerInputSchema);

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
export type ItemTriggerInput = z.infer<typeof itemTriggerInputSchema>;
export type ListItemsQuery = z.infer<typeof listItemsQuerySchema>;
