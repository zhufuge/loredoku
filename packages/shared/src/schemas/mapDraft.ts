import { z } from 'zod';
import {
  DEFAULT_REGION_COLOR,
  GRID_SIZE_MAX,
  PROJECT_NOTE_MAX_LENGTH,
  REGION_BORDER_WIDTH_DEFAULT,
  REGION_BORDER_WIDTH_MAX,
  REGION_BORDER_WIDTH_MIN,
  REGION_FILL_OPACITY_DEFAULT,
  REGION_FILL_OPACITY_MAX,
  REGION_FILL_OPACITY_MIN,
  REGION_NAME_MAX_LENGTH,
} from '../constants';
import { regionColorSchema } from './map';

const coordSchema = z.number().int().min(0).max(GRID_SIZE_MAX * 4);
const cellKeySchema = z.string().regex(/^\d+,\d+$/, '单元格坐标格式应为 "x,y"');

export const draftItemRefSchema = z.object({
  itemId: z.number().int().positive(),
});

export const draftAnchorItemSchema = z.object({
  itemId: z.number().int().positive(),
  w: z.number().int().min(1),
  h: z.number().int().min(1),
});

export const draftCellSchema = z
  .object({
    background: draftItemRefSchema.optional(),
    object: draftAnchorItemSchema.optional(),
    objectRef: z.string().trim().min(1).max(64).optional(),
  })
  .strict();

export const draftRegionSchema = z
  .object({
    id: z.string().trim().min(1).max(64),
    name: z.string().trim().min(1, '区域名称不能为空').max(REGION_NAME_MAX_LENGTH),
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
    cells: z.array(z.tuple([coordSchema, coordSchema])).min(1, '区域至少包含一个单元格'),
    labelCell: z.tuple([coordSchema, coordSchema]).nullable().optional(),
  })
  .strict();

export const characterSlotSchema = z.object({
  characterId: z.number().int().positive(),
});

export const placedCharacterSchema = z.object({
  characterId: z.number().int().positive(),
  x: coordSchema,
  y: coordSchema,
  mapMeta: z.record(z.unknown()).default({}),
});

export const mapDraftSchema = z
  .object({
    version: z.number().int().positive(),
    gridSize: z.number().int().min(3).max(24),
    cells: z.record(cellKeySchema, draftCellSchema),
    regions: z.array(draftRegionSchema),
    characterSlots: z.array(characterSlotSchema.nullable()),
    placedCharacters: z.array(placedCharacterSchema),
  })
  .strict();

export const createRegionInputSchema = draftRegionSchema.omit({ id: true });
export const updateRegionInputSchema = draftRegionSchema.omit({ id: true }).partial();

export const saveMapDraftSchema = z.object({
  data: mapDraftSchema,
  updatedAt: z.string().nullable().optional(),
});

export const importMapSchema = z.object({
  data: mapDraftSchema,
});

export const updateGridSizeSchema = z.object({
  gridSize: z.number().int().min(3).max(24),
});

export const publishSchema = z.object({
  notes: z.string().trim().max(PROJECT_NOTE_MAX_LENGTH).optional().nullable(),
});

export const listVersionsQuerySchema = z.object({
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
});

export const regionStringIdParamSchema = z.object({
  regionId: z.string().trim().min(1).max(64),
});

export type DraftItemRefInput = z.infer<typeof draftItemRefSchema>;
export type DraftAnchorItemInput = z.infer<typeof draftAnchorItemSchema>;
export type DraftCellInput = z.infer<typeof draftCellSchema>;
export type DraftRegionInput = z.infer<typeof draftRegionSchema>;
export type MapDraftInput = z.infer<typeof mapDraftSchema>;
export type SaveMapDraftInput = z.infer<typeof saveMapDraftSchema>;
export type ImportMapInput = z.infer<typeof importMapSchema>;
export type UpdateGridSizeInput = z.infer<typeof updateGridSizeSchema>;
export type PublishInput = z.infer<typeof publishSchema>;
