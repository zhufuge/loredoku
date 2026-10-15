import type { Context } from 'koa';
import { idParamSchema, publishSchema } from '@murdoku/shared';
import { z } from 'zod';
import { success } from '../utils/response';
import { parseOrThrow } from '../utils/validate';
import * as versionService from '../service/versionService';

const versionParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  versionNo: z.coerce.number().int().positive(),
});

export async function publish(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  const body = parseOrThrow(publishSchema, ctx.request.body ?? {});
  const version = await versionService.publishProject(id, body.notes ?? null);
  success(ctx, version, '发布成功');
}

export async function list(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  success(ctx, await versionService.listVersions(id));
}

/**
 * OPT-905 (docs/v0.3.4.md §5.1): works from every map, flat. Filtering,
 * sorting and paging happen in the web layer so the table logic stays
 * unit-testable (the published-work set is small).
 */
export async function listAll(ctx: Context): Promise<void> {
  success(ctx, await versionService.listAllWorks());
}

export async function detail(ctx: Context): Promise<void> {
  const { id, versionNo } = parseOrThrow(versionParamSchema, ctx.params);
  success(ctx, await versionService.getVersion(id, versionNo));
}

export async function createDraft(ctx: Context): Promise<void> {
  const { id, versionNo } = parseOrThrow(versionParamSchema, ctx.params);
  success(ctx, await versionService.createDraftFromVersion(id, versionNo), '已基于此作品创建草稿');
}

/** FEAT-503: 作品管理面板的删除操作。 */
export async function remove(ctx: Context): Promise<void> {
  const { id, versionNo } = parseOrThrow(versionParamSchema, ctx.params);
  await versionService.deleteVersion(id, versionNo);
  success(ctx, null, '作品已删除');
}
