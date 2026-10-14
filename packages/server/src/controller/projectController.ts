import type { Context } from 'koa';
import {
  createProjectSchema,
  idParamSchema,
  listProjectsQuerySchema,
  paginationQuerySchema,
  updateProjectSchema,
} from '@murdoku/shared';
import { success } from '../utils/response';
import { parseOrThrow } from '../utils/validate';
import * as projectService from '../service/projectService';

export async function list(ctx: Context): Promise<void> {
  const query = parseOrThrow(listProjectsQuerySchema, ctx.query);
  const { page, pageSize } = parseOrThrow(paginationQuerySchema, ctx.query);
  const result = await projectService.listProjects({ ...query, page, pageSize });
  success(ctx, result);
}

export async function detail(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  const project = await projectService.getProjectDetail(id);
  success(ctx, project);
}

export async function create(ctx: Context): Promise<void> {
  const body = parseOrThrow(createProjectSchema, ctx.request.body ?? {});
  const project = await projectService.createProject(body);
  success(ctx, project, '创建成功');
}

export async function update(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  const body = parseOrThrow(updateProjectSchema, ctx.request.body ?? {});
  const project = await projectService.updateProject(id, body);
  success(ctx, project, '更新成功');
}

export async function remove(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  await projectService.deleteProject(id);
  success(ctx, null, '删除成功');
}

export async function duplicate(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  const project = await projectService.duplicateProject(id);
  success(ctx, project, '复制成功');
}
