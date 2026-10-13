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

export const projectNameSchema = z
  .string()
  .trim()
  .min(1, '项目名称必填')
  .max(PROJECT_NAME_MAX_LENGTH, `项目名称不能超过 ${PROJECT_NAME_MAX_LENGTH} 字`);

export const projectDescriptionSchema = z
  .string()
  .trim()
  .max(PROJECT_DESCRIPTION_MAX_LENGTH, `描述不能超过 ${PROJECT_DESCRIPTION_MAX_LENGTH} 字`);

export const createProjectSchema = z.object({
  name: projectNameSchema,
  description: projectDescriptionSchema.optional().nullable(),
  gridSize: gridSizeSchema.default(GRID_SIZE_DEFAULT),
});

export const updateProjectSchema = z.object({
  name: projectNameSchema.optional(),
  description: projectDescriptionSchema.optional().nullable(),
});

export const listProjectsQuerySchema = z.object({
  keyword: z.string().trim().max(PROJECT_NAME_MAX_LENGTH).optional(),
  sort: z.enum(['updatedAt', 'name', 'createdAt']).default('updatedAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;
