import type { Context } from 'koa';
import { idParamSchema, publishSchema } from '@loredoku/shared';
import { z } from 'zod';
import { success } from '../utils/response';
import { parseOrThrow } from '../utils/validate';
import * as puzzleService from '../service/puzzleService';

/**
 * 谜题版本端点（v0.7.1 §5.5）—— 与 `versionController`（地图）同形，只是
 * 版本号不参与 URL：`:id` 先解析出血统根，再在血统内按号定位。
 */

const versionParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  versionNo: z.coerce.number().int().positive(),
});

/** 发布：body 可带 `version`（默认 MAX+1，可填空洞号）。 */
export async function publish(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  const body = parseOrThrow(publishSchema, ctx.request.body ?? {});
  success(ctx, await puzzleService.publishPuzzle(id, body.version), '发布成功');
}

/** 版本历史面板：整个血统的活版本行，版本号倒序。 */
export async function list(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  success(ctx, await puzzleService.listVersions(id));
}

export async function detail(ctx: Context): Promise<void> {
  const { id, versionNo } = parseOrThrow(versionParamSchema, ctx.params);
  success(ctx, await puzzleService.getVersion(id, versionNo));
}

/** 「编辑此版本」= fork 出一条新草稿行，版本行不动（谜题不做 `?v=` fork 态）。 */
export async function fork(ctx: Context): Promise<void> {
  const { id, versionNo } = parseOrThrow(versionParamSchema, ctx.params);
  success(ctx, await puzzleService.forkVersion(id, versionNo), `已从 v${versionNo} 新增一个条目`);
}

/** 删版本 = 软删；挂着未取消部署的游戏时 400。 */
export async function remove(ctx: Context): Promise<void> {
  const { id, versionNo } = parseOrThrow(versionParamSchema, ctx.params);
  await puzzleService.deleteVersion(id, versionNo);
  success(ctx, null, '版本已删除');
}
