import { z } from 'zod';
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../constants';

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(DEFAULT_PAGE),
  pageSize: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export const positiveInt = z.number().int().positive();
