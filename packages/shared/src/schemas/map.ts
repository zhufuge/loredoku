import { z } from 'zod';
import {
  GRID_SIZE_DEFAULT,
  GRID_SIZE_MAX,
  GRID_SIZE_MIN,
  MAP_DESCRIPTION_MAX_LENGTH,
  MAP_NAME_MAX_LENGTH,
} from '../constants';

export const gridSizeSchema = z
  .number()
  .int('画布尺寸必须为整数')
  .min(GRID_SIZE_MIN, `画布尺寸不能小于 ${GRID_SIZE_MIN}`)
  .max(GRID_SIZE_MAX, `画布尺寸不能大于 ${GRID_SIZE_MAX}`);

/**
 * 校验消息直接出现在 web 的 toast 里，所以一律说「地图」而不是表名。
 */
export const mapNameSchema = z
  .string()
  .trim()
  .min(1, '地图名称必填')
  .max(MAP_NAME_MAX_LENGTH, `地图名称不能超过 ${MAP_NAME_MAX_LENGTH} 字`);

export const mapDescriptionSchema = z
  .string()
  .trim()
  .max(MAP_DESCRIPTION_MAX_LENGTH, `描述不能超过 ${MAP_DESCRIPTION_MAX_LENGTH} 字`);

/**
 * 创建地图只要名称和描述：画布尺寸在编辑器首次进入时由初始化弹窗写进草稿
 * （`data.gridSize`）。
 */
export const createMapSchema = z.object({
  name: mapNameSchema,
  description: mapDescriptionSchema.optional().nullable(),
});

export const updateMapSchema = z.object({
  name: mapNameSchema.optional(),
  description: mapDescriptionSchema.optional().nullable(),
});

/**
 * `kind` 让「草稿」「版本」两块各自分页 —— 前端对同一端点发
 * 两个请求，各自的 `total` 才准；不传则仍是并集口径（兼容既有调用方）。
 */
export const listMapEntriesKindSchema = z.enum(['draft', 'version']);

export const listMapsQuerySchema = z.object({
  keyword: z.string().trim().max(MAP_NAME_MAX_LENGTH).optional(),
  kind: listMapEntriesKindSchema.optional(),
  sort: z.enum(['updatedAt', 'name', 'createdAt']).default('updatedAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type CreateMapInput = z.infer<typeof createMapSchema>;
export type UpdateMapInput = z.infer<typeof updateMapSchema>;
export type ListMapsQuery = z.infer<typeof listMapsQuerySchema>;
