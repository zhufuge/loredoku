import type { Context } from 'koa';
import {
  createCardSchema,
  idParamSchema,
  listCardsQuerySchema,
  replaceTriggersSchema,
  updateCardSchema,
} from '@murdoku/shared';
import { success } from '../utils/response';
import { parseOrThrow } from '../utils/validate';
import * as cardService from '../service/cardService';

export async function list(ctx: Context): Promise<void> {
  const query = parseOrThrow(listCardsQuerySchema, ctx.query);
  const cards = await cardService.listCards(query);
  success(ctx, cards);
}

export async function detail(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  success(ctx, await cardService.getCard(id));
}

export async function create(ctx: Context): Promise<void> {
  const body = parseOrThrow(createCardSchema, ctx.request.body ?? {});
  const card = await cardService.createCard(body);
  success(ctx, card, '创建成功');
}

export async function update(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  const body = parseOrThrow(updateCardSchema, ctx.request.body ?? {});
  const card = await cardService.updateCard(id, body);
  success(ctx, card, '更新成功');
}

export async function remove(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  const clearReferences = ctx.query.clearReferences === 'true';
  await cardService.deleteCard(id, clearReferences);
  success(ctx, null, '已停用');
}

export async function uploadImage(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  const file = ctx.file;
  if (!file) {
    throw new Error('缺少上传文件');
  }
  const card = await cardService.uploadImage(id, file.buffer);
  success(ctx, card, '上传成功');
}

export async function deleteImage(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  const card = await cardService.deleteImage(id);
  success(ctx, card, '图片已删除');
}

export async function usages(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  success(ctx, await cardService.getUsages(id));
}

export async function replaceTriggers(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  const triggers = parseOrThrow(replaceTriggersSchema, ctx.request.body ?? []);
  const card = await cardService.replaceTriggers(id, triggers);
  success(ctx, card, '触发信息已保存');
}
