import type { Context } from 'koa';
import { forkVersionBodySchema, idParamSchema, publishSchema } from '@loredoku/shared';
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
  // body 可带 `version`（默认 MAX+1，用户可改）；
  // `.strict()` 仍挡住旧客户端多传的 `notes`。
  const body = parseOrThrow(publishSchema, ctx.request.body ?? {});
  const version = await versionService.publishMap(id, body.version);
  success(ctx, version, '发布成功');
}

/**
 * SPEC-K13 §7.4 (docs/v0.5.0.md): the editor's 版本历史 panel. With Q3 = B this
 * is the **whole blood lineage**, not just this `maps` row, so each
 * entry carries the row that owns it.
 */
export async function list(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  success(ctx, await versionService.listMapVersions(id));
}

export async function detail(ctx: Context): Promise<void> {
  const { id, versionNo } = parseOrThrow(versionParamSchema, ctx.params);
  success(ctx, await versionService.getVersion(id, versionNo));
}

/**
 * SPEC-K11 (docs/v0.5.0.md §7.3): "edit this version" creates a **new work
 * entry** in the same lineage; `map_versions` is never written.
 *
 * body 可带 `data` —— 版本条目进编辑器后「保存时才生成草稿」，
 * 那一刻的编辑器画布随 fork 一起写进新行（不传则用快照 data，即版本历史
 * 面板「编辑此版本」的老行为）。
 */
export async function fork(ctx: Context): Promise<void> {
  const { id, versionNo } = parseOrThrow(versionParamSchema, ctx.params);
  const body = parseOrThrow(forkVersionBodySchema, ctx.request.body ?? {});
  const mapEntry = await versionService.forkVersion(id, versionNo, body.data);
  success(ctx, mapEntry, `已从 v${versionNo} 新增一个条目`);
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
