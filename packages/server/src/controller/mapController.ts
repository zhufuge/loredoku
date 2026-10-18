import type { Context } from 'koa';
import {
  createRegionInputSchema,
  idParamSchema,
  importMapSchema,
  legacyMapDraftBlocks,
  regionStringIdParamSchema,
  saveMapDraftSchema,
  updateGridSizeSchema,
  updateRegionInputSchema,
} from '@loredoku/shared';
import { success } from '../utils/response';
import { parseOrThrow } from '../utils/validate';
import { AppError } from '../utils/AppError';
import * as mapService from '../service/mapService';

export async function getMap(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  success(ctx, await mapService.getMap(id));
}

export async function saveMap(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  const body = parseOrThrow(saveMapDraftSchema, ctx.request.body ?? {});
  success(ctx, await mapService.saveMap(id, body), '保存成功');
}

export async function updateGridSize(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  const body = parseOrThrow(updateGridSizeSchema, ctx.request.body ?? {});
  success(ctx, await mapService.updateGridSize(id, body.gridSize), '画布尺寸已更新');
}

export async function exportMap(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  success(ctx, await mapService.exportMap(id));
}

export async function importMap(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  const raw = ctx.request.body ?? {};
  /**
   * a v2 file (roster / palette inside it) is **rejected, not
   * silently stripped** — otherwise the author would believe their participants
   * came along. The check runs before the schema, which would only produce a
   * generic "参数校验失败".
   */
  const blocks = legacyMapDraftBlocks((raw as { data?: unknown }).data);
  if (blocks.length > 0) {
    throw AppError.validation(
      `该 JSON 是旧版，含${blocks.join('、')}；这些内容已移到「谜题」，请改用谜题导入`,
    );
  }
  const body = parseOrThrow(importMapSchema, raw);
  success(ctx, await mapService.importMap(id, body.data), '导入成功');
}

export async function listRegions(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  success(ctx, await mapService.listRegions(id));
}

export async function createRegion(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  const body = parseOrThrow(createRegionInputSchema, ctx.request.body ?? {});
  success(ctx, await mapService.createRegion(id, body), '区域创建成功');
}

export async function updateRegion(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  const { regionId } = parseOrThrow(regionStringIdParamSchema, ctx.params);
  const body = parseOrThrow(updateRegionInputSchema, ctx.request.body ?? {});
  success(ctx, await mapService.updateRegion(id, regionId, body), '区域更新成功');
}

export async function deleteRegion(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  const { regionId } = parseOrThrow(regionStringIdParamSchema, ctx.params);
  await mapService.deleteRegion(id, regionId);
  success(ctx, null, '区域已删除');
}
