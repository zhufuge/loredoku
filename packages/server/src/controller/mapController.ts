import type { Context } from 'koa';
import {
  createMapSchema,
  idParamSchema,
  listMapsQuerySchema,
  paginationQuerySchema,
  updateMapSchema,
} from '@loredoku/shared';
import { success } from '../utils/response';
import { parseOrThrow } from '../utils/validate';
import * as mapService from '../service/mapService';

export async function list(ctx: Context): Promise<void> {
  const query = parseOrThrow(listMapsQuerySchema, ctx.query);
  const { page, pageSize } = parseOrThrow(paginationQuerySchema, ctx.query);
  const result = await mapService.listMapEntries({ ...query, page, pageSize });
  success(ctx, result);
}

/**
 * FEAT-K03 (docs/v0.5.0.md §2.4): every published map version, for the
 * 「地图版本」 picker. Registered **before** `/:id` in the router, otherwise
 * `versions` would be parsed as an id.
 */
export async function listPublishedVersions(ctx: Context): Promise<void> {
  success(ctx, await mapService.listPublishedVersions());
}

export async function detail(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  const mapEntry = await mapService.getMapDetail(id);
  success(ctx, mapEntry);
}

export async function create(ctx: Context): Promise<void> {
  const body = parseOrThrow(createMapSchema, ctx.request.body ?? {});
  const mapEntry = await mapService.createMap(body);
  success(ctx, mapEntry, '创建成功');
}

export async function update(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  const body = parseOrThrow(updateMapSchema, ctx.request.body ?? {});
  const mapEntry = await mapService.updateMap(id, body);
  success(ctx, mapEntry, '更新成功');
}

export async function remove(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  await mapService.deleteMap(id);
  success(ctx, null, '删除成功');
}

export async function duplicate(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  const mapEntry = await mapService.duplicateMap(id);
  success(ctx, mapEntry, '复制成功');
}

/** FEAT-H03 §3.2(c): multipart cover write for a map (`POST /:id/cover`). */
export async function uploadCover(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  const file = (ctx as Context & { file?: { buffer: Buffer } }).file;
  if (!file) {
    throw mapService.coverRequired();
  }
  success(ctx, await mapService.uploadCover(id, file.buffer), '封面上传成功');
}

/** FEAT-H03 §3.2(c): explicit cover removal (`DELETE /:id/cover`). */
export async function removeCover(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  success(ctx, await mapService.removeCover(id), '封面已移除');
}
