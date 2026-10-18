import { z } from 'zod';
import {
  GRID_SIZE_DEFAULT,
  GRID_SIZE_MAX,
  GRID_SIZE_MIN,
  PROJECT_DESCRIPTION_MAX_LENGTH,
  PROJECT_NAME_MAX_LENGTH,
} from '../constants';

export const gridSizeSchema = z
  .number()
  .int('画布尺寸必须为整数')
  .min(GRID_SIZE_MIN, `画布尺寸不能小于 ${GRID_SIZE_MIN}`)
  .max(GRID_SIZE_MAX, `画布尺寸不能大于 ${GRID_SIZE_MAX}`);

/**
 * OPT-H02 (docs/v0.4.2.md §2): identifiers stay `project*` (table, routes, types)
 * but every **user-visible** string says 「地图」 — these messages surface in the
 * web toast, so they are part of the rename.
 */
export const projectNameSchema = z
  .string()
  .trim()
  .min(1, '地图名称必填')
  .max(PROJECT_NAME_MAX_LENGTH, `地图名称不能超过 ${PROJECT_NAME_MAX_LENGTH} 字`);

export const projectDescriptionSchema = z
  .string()
  .trim()
  .max(PROJECT_DESCRIPTION_MAX_LENGTH, `描述不能超过 ${PROJECT_DESCRIPTION_MAX_LENGTH} 字`);

/**
 * 创建地图只要名称和描述：画布尺寸在编辑器首次进入时由初始化弹窗写进草稿
 * （`data.gridSize`）。
 */
export const createProjectSchema = z.object({
  name: projectNameSchema,
  description: projectDescriptionSchema.optional().nullable(),
});

export const updateProjectSchema = z.object({
  name: projectNameSchema.optional(),
  description: projectDescriptionSchema.optional().nullable(),
});

/**
 * `kind` 让「草稿」「版本」两块各自分页 —— 前端对同一端点发
 * 两个请求，各自的 `total` 才准；不传则仍是并集口径（兼容既有调用方）。
 */
export const listMapEntriesKindSchema = z.enum(['draft', 'version']);

export const listProjectsQuerySchema = z.object({
  keyword: z.string().trim().max(PROJECT_NAME_MAX_LENGTH).optional(),
  kind: listMapEntriesKindSchema.optional(),
  sort: z.enum(['updatedAt', 'name', 'createdAt']).default('updatedAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;
