import type { Context } from 'koa';
import {
  createAssetFormSchema,
  updateAssetFormSchema,
} from '@loredoku/shared';
import { success } from '../utils/response';
import { parseOrThrow } from '../utils/validate';
import * as assetFormService from '../service/assetFormService';

/**
 * 形态路由都挂在资产下（`/:id/forms/:formId`），实例参数与资产端点同一套命名。
 */
function formParams(ctx: Context): { assetId: number; formId: number } {
  return {
    assetId: Number(ctx.params.id),
    formId: Number(ctx.params.formId),
  };
}

export async function list(ctx: Context): Promise<void> {
  success(ctx, await assetFormService.listForms(Number(ctx.params.id)));
}

export async function create(ctx: Context): Promise<void> {
  const body = parseOrThrow(createAssetFormSchema, ctx.request.body ?? {});
  success(ctx, await assetFormService.createForm(Number(ctx.params.id), body), '创建成功');
}

export async function update(ctx: Context): Promise<void> {
  const { assetId, formId } = formParams(ctx);
  const body = parseOrThrow(updateAssetFormSchema, ctx.request.body ?? {});
  success(ctx, await assetFormService.updateForm(assetId, formId, body), '更新成功');
}

export async function remove(ctx: Context): Promise<void> {
  const { assetId, formId } = formParams(ctx);
  await assetFormService.deleteForm(assetId, formId);
  success(ctx, null, '已删除');
}

export async function usages(ctx: Context): Promise<void> {
  const { assetId, formId } = formParams(ctx);
  success(ctx, await assetFormService.getFormUsages(assetId, formId));
}

export async function uploadImage(ctx: Context): Promise<void> {
  const { assetId, formId } = formParams(ctx);
  const file = ctx.file;
  if (!file) {
    throw new Error('缺少上传文件');
  }
  success(ctx, await assetFormService.uploadImage(assetId, formId, file.buffer), '上传成功');
}

export async function deleteImage(ctx: Context): Promise<void> {
  const { assetId, formId } = formParams(ctx);
  success(ctx, await assetFormService.deleteImage(assetId, formId), '图片已删除');
}
