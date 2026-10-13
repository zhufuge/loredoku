import { z } from 'zod';
import {
  CARD_CODE_MAX_LENGTH,
  CARD_CODE_PATTERN,
  CARD_NAME_MAX_LENGTH,
  EFFECT_TYPES,
} from '../constants';

export const effectTypeSchema = z.enum(EFFECT_TYPES);

export const cardTriggerInputSchema = z.object({
  triggerKey: z.string().trim().min(1, '触发键必填').max(64),
  triggerValue: z.string().trim().min(1, '触发值必填').max(255),
  effectType: effectTypeSchema,
  effectConfig: z.record(z.unknown()).default({}),
});

export const cardCodeSchema = z
  .string()
  .trim()
  .min(1, '业务 ID 必填')
  .max(CARD_CODE_MAX_LENGTH, `业务 ID 不能超过 ${CARD_CODE_MAX_LENGTH} 字`)
  .regex(CARD_CODE_PATTERN, '业务 ID 仅允许字母、数字与下划线');

export const createCardSchema = z.object({
  code: cardCodeSchema,
  name: z.string().trim().min(1, '卡片名称必填').max(CARD_NAME_MAX_LENGTH),
  meta: z.record(z.unknown()).default({}),
  triggers: z.array(cardTriggerInputSchema).default([]),
});

export const updateCardSchema = z.object({
  name: z.string().trim().min(1).max(CARD_NAME_MAX_LENGTH).optional(),
  meta: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

export const replaceTriggersSchema = z.array(cardTriggerInputSchema);

export const listCardsQuerySchema = z.object({
  keyword: z.string().trim().optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

export type CreateCardInput = z.infer<typeof createCardSchema>;
export type UpdateCardInput = z.infer<typeof updateCardSchema>;
export type CardTriggerInput = z.infer<typeof cardTriggerInputSchema>;
export type ListCardsQuery = z.infer<typeof listCardsQuerySchema>;
