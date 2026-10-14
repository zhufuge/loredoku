import type { Context } from 'koa';
import {
  createCharacterSchema,
  idParamSchema,
  listCharactersQuerySchema,
  updateCharacterSchema,
} from '@murdoku/shared';
import { success } from '../utils/response';
import { parseOrThrow } from '../utils/validate';
import * as characterService from '../service/characterService';

export async function list(ctx: Context): Promise<void> {
  const query = parseOrThrow(listCharactersQuerySchema, ctx.query);
  success(ctx, await characterService.listCharacters(query));
}

export async function detail(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  success(ctx, await characterService.getCharacter(id));
}

export async function create(ctx: Context): Promise<void> {
  const body = parseOrThrow(createCharacterSchema, ctx.request.body ?? {});
  success(ctx, await characterService.createCharacter(body), '创建成功');
}

export async function update(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  const body = parseOrThrow(updateCharacterSchema, ctx.request.body ?? {});
  success(ctx, await characterService.updateCharacter(id, body), '更新成功');
}

export async function remove(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  await characterService.deleteCharacter(id);
  success(ctx, null, '已停用');
}

export async function uploadAvatar(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  const file = ctx.file;
  if (!file) {
    throw new Error('缺少上传文件');
  }
  success(ctx, await characterService.uploadAvatar(id, file.buffer), '上传成功');
}

export async function deleteAvatar(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  success(ctx, await characterService.deleteAvatar(id), '头像已删除');
}

export async function usages(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  success(ctx, await characterService.getUsages(id));
}
