import type { Context } from 'koa';
import {
  createRegionSchema,
  idParamSchema,
  regionIdParamSchema,
  updateRegionSchema,
} from '@murdoku/shared';
import { success } from '../utils/response';
import { parseOrThrow } from '../utils/validate';
import * as mapService from '../service/mapService';

export async function list(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  const regions = await mapService.listRegions(id);
  success(ctx, regions);
}

export async function create(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  const body = parseOrThrow(createRegionSchema, ctx.request.body ?? {});
  const region = await mapService.createRegion(id, body);
  success(ctx, region, '创建成功');
}

export async function update(ctx: Context): Promise<void> {
  const { regionId } = parseOrThrow(regionIdParamSchema, ctx.params);
  const body = parseOrThrow(updateRegionSchema, ctx.request.body ?? {});
  const region = await mapService.updateRegion(regionId, body);
  success(ctx, region, '更新成功');
}

export async function remove(ctx: Context): Promise<void> {
  const { regionId } = parseOrThrow(regionIdParamSchema, ctx.params);
  await mapService.deleteRegion(regionId);
  success(ctx, null, '删除成功');
}
