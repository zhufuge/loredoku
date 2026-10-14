import type { Context } from 'koa';
import { idParamSchema, saveMapSchema } from '@murdoku/shared';
import { success } from '../utils/response';
import { parseOrThrow } from '../utils/validate';
import * as mapService from '../service/mapService';

export async function getMap(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  const map = await mapService.getMap(id);
  success(ctx, map);
}

export async function saveMap(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  const body = parseOrThrow(saveMapSchema, ctx.request.body ?? {});
  const map = await mapService.saveMap(id, body);
  success(ctx, map, '保存成功');
}
