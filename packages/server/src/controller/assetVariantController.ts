import type { Context } from 'koa';
import {
  createAssetVariantSchema,
  updateAssetVariantSchema,
} from '@loredoku/shared';
import { success } from '../utils/response';
import { parseOrThrow } from '../utils/validate';
import * as assetVariantService from '../service/assetVariantService';

/**
 * 形态路由都挂在资产下（`/:id/variants/:variantId`），实例参数与资产端点同一套命名。
 */
function variantParams(ctx: Context): { assetId: number; variantId: number } {
  return {
    assetId: Number(ctx.params.id),
    variantId: Number(ctx.params.variantId),
  };
}

export async function list(ctx: Context): Promise<void> {
  success(ctx, await assetVariantService.listVariants(Number(ctx.params.id)));
}

export async function create(ctx: Context): Promise<void> {
  const body = parseOrThrow(createAssetVariantSchema, ctx.request.body ?? {});
  success(ctx, await assetVariantService.createVariant(Number(ctx.params.id), body), '创建成功');
}

export async function update(ctx: Context): Promise<void> {
  const { assetId, variantId } = variantParams(ctx);
  const body = parseOrThrow(updateAssetVariantSchema, ctx.request.body ?? {});
  success(ctx, await assetVariantService.updateVariant(assetId, variantId, body), '更新成功');
}

export async function remove(ctx: Context): Promise<void> {
  const { assetId, variantId } = variantParams(ctx);
  await assetVariantService.deleteVariant(assetId, variantId);
  success(ctx, null, '已删除');
}

export async function usages(ctx: Context): Promise<void> {
  const { assetId, variantId } = variantParams(ctx);
  success(ctx, await assetVariantService.getVariantUsages(assetId, variantId));
}

export async function uploadImage(ctx: Context): Promise<void> {
  const { assetId, variantId } = variantParams(ctx);
  const file = ctx.file;
  if (!file) {
    throw new Error('缺少上传文件');
  }
  success(ctx, await assetVariantService.uploadImage(assetId, variantId, file.buffer), '上传成功');
}

export async function deleteImage(ctx: Context): Promise<void> {
  const { assetId, variantId } = variantParams(ctx);
  success(ctx, await assetVariantService.deleteImage(assetId, variantId), '图片已删除');
}
