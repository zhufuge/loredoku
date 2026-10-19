import type { Context } from 'koa';
import {
  createAssetSchema,
  idParamSchema,
  listAssetsQuerySchema,
  updateAssetSchema,
} from '@loredoku/shared';
import { success } from '../utils/response';
import { parseOrThrow } from '../utils/validate';
import * as assetService from '../service/assetService';

export async function list(ctx: Context): Promise<void> {
  const query = parseOrThrow(listAssetsQuerySchema, ctx.query);
  success(ctx, await assetService.listAssets(query));
}

export async function detail(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  success(ctx, await assetService.getAsset(id));
}

export async function create(ctx: Context): Promise<void> {
  const body = parseOrThrow(createAssetSchema, ctx.request.body ?? {});
  success(ctx, await assetService.createAsset(body), '创建成功');
}

export async function update(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  const body = parseOrThrow(updateAssetSchema, ctx.request.body ?? {});
  success(ctx, await assetService.updateAsset(id, body), '更新成功');
}

export async function remove(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  const clearReferences = ctx.query.clearReferences === 'true';
  if (ctx.query.hard === 'true') {
    await assetService.hardDeleteAsset(id, clearReferences);
    success(ctx, null, '已删除');
    return;
  }
  await assetService.deleteAsset(id, clearReferences);
  success(ctx, null, '已停用');
}

export async function enable(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  success(ctx, await assetService.setAssetActive(id, true), '已启用');
}

export async function disable(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  success(ctx, await assetService.setAssetActive(id, false), '已停用');
}

export async function uploadImage(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  const file = ctx.file;
  if (!file) {
    throw new Error('缺少上传文件');
  }
  success(ctx, await assetService.uploadImage(id, file.buffer), '上传成功');
}

export async function deleteImage(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  success(ctx, await assetService.deleteImage(id), '图片已删除');
}

export async function usages(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  success(ctx, await assetService.getUsages(id));
}

/**
 * v0.5.2 FEAT-M03 (docs/v0.5.2.md §3.1): no triggers route is registered — a
 * stale client gets 404 rather than a 500 from a dead schema.
 */
