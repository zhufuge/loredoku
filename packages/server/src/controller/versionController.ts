import type { Context } from 'koa';
import { idParamSchema, publishSchema } from '@loredoku/shared';
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

/**
 * SPEC-K13 §7.4 (docs/v0.5.0.md): the editor's 版本历史 panel. With Q3 = B this
 * is the **whole blood lineage**, not just this `map_projects` row, so each
 * entry carries the row that owns it.
 */
export async function list(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  success(ctx, await versionService.listVersionsForProject(id));
}

export async function detail(ctx: Context): Promise<void> {
  const { id, versionNo } = parseOrThrow(versionParamSchema, ctx.params);
  success(ctx, await versionService.getVersion(id, versionNo));
}

/**
 * SPEC-K11 (docs/v0.5.0.md §7.3): "edit this version" creates a **new work
 * entry** in the same lineage; `map_versions` is never written.
 */
export async function fork(ctx: Context): Promise<void> {
  const { id, versionNo } = parseOrThrow(versionParamSchema, ctx.params);
  const project = await versionService.forkVersion(id, versionNo);
  success(ctx, project, `已从 v${versionNo} 新增一个条目`);
}

/**
 * @deprecated v0.5.0 §15 Q9 — superseded by {@link fork}. Kept for historical
 * callers only; no UI entry point reaches it.
 */
export async function createDraft(ctx: Context): Promise<void> {
  const { id, versionNo } = parseOrThrow(versionParamSchema, ctx.params);
  success(ctx, await versionService.createDraftFromVersion(id, versionNo), '已基于此版本创建草稿');
}

/** FEAT-503: 地图版本面板的删除操作。 */
export async function remove(ctx: Context): Promise<void> {
  const { id, versionNo } = parseOrThrow(versionParamSchema, ctx.params);
  await versionService.deleteVersion(id, versionNo);
  success(ctx, null, '版本已删除');
}
