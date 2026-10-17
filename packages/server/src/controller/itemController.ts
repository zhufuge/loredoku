import type { Context } from 'koa';
import {
  createItemSchema,
  idParamSchema,
  listItemsQuerySchema,
  updateItemSchema,
} from '@loredoku/shared';
import { success } from '../utils/response';
import { parseOrThrow } from '../utils/validate';
import * as itemService from '../service/itemService';

export async function list(ctx: Context): Promise<void> {
  const query = parseOrThrow(listItemsQuerySchema, ctx.query);
  success(ctx, await itemService.listItems(query));
}

export async function detail(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  success(ctx, await itemService.getItem(id));
}

export async function create(ctx: Context): Promise<void> {
  const body = parseOrThrow(createItemSchema, ctx.request.body ?? {});
  success(ctx, await itemService.createItem(body), '创建成功');
}

export async function update(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  const body = parseOrThrow(updateItemSchema, ctx.request.body ?? {});
  success(ctx, await itemService.updateItem(id, body), '更新成功');
}

export async function remove(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  const clearReferences = ctx.query.clearReferences === 'true';
  if (ctx.query.hard === 'true') {
    await itemService.hardDeleteItem(id, clearReferences);
    success(ctx, null, '已删除');
    return;
  }
  await itemService.deleteItem(id, clearReferences);
  success(ctx, null, '已停用');
}

export async function enable(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  success(ctx, await itemService.setItemActive(id, true), '已启用');
}

export async function disable(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  success(ctx, await itemService.setItemActive(id, false), '已停用');
}

export async function uploadImage(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  const file = ctx.file;
  if (!file) {
    throw new Error('缺少上传文件');
  }
  success(ctx, await itemService.uploadImage(id, file.buffer), '上传成功');
}

export async function deleteImage(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  success(ctx, await itemService.deleteImage(id), '图片已删除');
}

export async function usages(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  success(ctx, await itemService.getUsages(id));
}

/**
 * v0.5.2 FEAT-M03 (docs/v0.5.2.md §3.1): no triggers route is registered — a
 * stale client gets 404 rather than a 500 from a dead schema.
 */
