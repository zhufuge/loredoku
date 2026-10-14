import { z } from 'zod';
import {
  CARD_ROTATIONS,
  DEFAULT_REGION_COLOR,
  REGION_BORDER_WIDTH_DEFAULT,
  REGION_BORDER_WIDTH_MAX,
  REGION_BORDER_WIDTH_MIN,
  REGION_DESCRIPTION_MAX_LENGTH,
  REGION_FILL_OPACITY_DEFAULT,
  REGION_FILL_OPACITY_MAX,
  REGION_FILL_OPACITY_MIN,
  REGION_NAME_MAX_LENGTH,
} from '../constants';

export const regionColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, '颜色必须为 #RRGGBB 格式');

export const regionCellSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
});

export const mapCellSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  cardId: z.number().int().positive(),
  rotation: z
    .number()
    .int()
    .refine((v): v is (typeof CARD_ROTATIONS)[number] => (CARD_ROTATIONS as readonly number[]).includes(v), {
      message: '旋转角度必须为 0 / 90 / 180 / 270',
    })
    .default(0),
  zIndex: z.number().int().default(0),
});

export const regionInputSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1, '区域名称必填').max(REGION_NAME_MAX_LENGTH),
  description: z.string().trim().max(REGION_DESCRIPTION_MAX_LENGTH).optional().nullable(),
  color: regionColorSchema.default(DEFAULT_REGION_COLOR),
  borderWidth: z
    .number()
    .int()
    .min(REGION_BORDER_WIDTH_MIN)
    .max(REGION_BORDER_WIDTH_MAX)
    .default(REGION_BORDER_WIDTH_DEFAULT),
  fillOpacity: z
    .number()
    .min(REGION_FILL_OPACITY_MIN)
    .max(REGION_FILL_OPACITY_MAX)
    .default(REGION_FILL_OPACITY_DEFAULT),
  cells: z.array(regionCellSchema).min(1, '区域至少包含一个单元格'),
});

export const saveMapSchema = z.object({
  updatedAt: z.string().optional(),
  cells: z.array(mapCellSchema),
  regions: z.array(regionInputSchema),
});

export const createRegionSchema = regionInputSchema.omit({ id: true });

export const updateRegionSchema = z.object({
  name: z.string().trim().min(1).max(REGION_NAME_MAX_LENGTH).optional(),
  description: z.string().trim().max(REGION_DESCRIPTION_MAX_LENGTH).optional().nullable(),
  color: regionColorSchema.optional(),
  borderWidth: z.number().int().min(REGION_BORDER_WIDTH_MIN).max(REGION_BORDER_WIDTH_MAX).optional(),
  fillOpacity: z.number().min(REGION_FILL_OPACITY_MIN).max(REGION_FILL_OPACITY_MAX).optional(),
  cells: z.array(regionCellSchema).min(1).optional(),
});

export type MapCellInput = z.infer<typeof mapCellSchema>;
export type RegionInput = z.infer<typeof regionInputSchema>;
export type SaveMapInput = z.infer<typeof saveMapSchema>;
export type CreateRegionInput = z.infer<typeof createRegionSchema>;
export type UpdateRegionInput = z.infer<typeof updateRegionSchema>;

export const regionIdParamSchema = z.object({
  regionId: z.coerce.number().int().positive(),
});
