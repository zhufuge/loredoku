import type { Context } from 'koa';
import {
  createPuzzleSchema,
  idParamSchema,
  listPuzzlesQuerySchema,
  paginationQuerySchema,
  savePuzzleDraftSchema,
  updatePuzzleSchema,
} from '@loredoku/shared';
import { success } from '../utils/response';
import { parseOrThrow } from '../utils/validate';
import * as puzzleService from '../service/puzzleService';

/**
 * 谜题模块的 HTTP 层（v0.7.1 §6.3）。每个 handler 都是薄壳 —— 规则（版本行只读、
 * 底图自带、发布校验）全在 `puzzleService`。
 */

export async function list(ctx: Context): Promise<void> {
  const query = parseOrThrow(listPuzzlesQuerySchema, ctx.query);
  const { page, pageSize } = parseOrThrow(paginationQuerySchema, ctx.query);
  success(ctx, await puzzleService.listPuzzleEntries({ ...query, page, pageSize }));
}

export async function create(ctx: Context): Promise<void> {
  const body = parseOrThrow(createPuzzleSchema, ctx.request.body ?? {});
  success(ctx, await puzzleService.createPuzzle(body), '创建成功');
}

export async function detail(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  success(ctx, await puzzleService.getPuzzle(id));
}

/** §5.3：编辑器渲染的只读画布 —— 现在读谜题**自己的副本**。 */
export async function mapContext(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  success(ctx, await puzzleService.getPuzzleMapContext(id));
}

export async function save(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  const body = parseOrThrow(savePuzzleDraftSchema, ctx.request.body ?? {});
  success(ctx, await puzzleService.savePuzzle(id, body), '保存成功');
}

export async function update(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  const body = parseOrThrow(updatePuzzleSchema, ctx.request.body ?? {});
  success(ctx, await puzzleService.updatePuzzle(id, body), '更新成功');
}

export async function remove(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  await puzzleService.deletePuzzle(id);
  success(ctx, null, '删除成功');
}

export async function duplicate(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  success(ctx, await puzzleService.duplicatePuzzle(id), '复制成功');
}

/** §7.5: 谜题封面（multipart）—— 建行之后才传，所以新建弹窗是「建完再传」。 */
export async function uploadCover(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  const file = (ctx as Context & { file?: { buffer: Buffer } }).file;
  if (!file) {
    throw puzzleService.coverRequired();
  }
  success(ctx, await puzzleService.uploadCover(id, file.buffer), '封面上传成功');
}

export async function removeCover(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  success(ctx, await puzzleService.removeCover(id), '封面已移除');
}

/**
 * v0.8.6 §4：禁止符号图（multipart）。只写文件、不写库 —— 草稿里的 `path` 由
 * 下一次保存请求带回来（和封面不同：它不是行上的列）。
 *
 * 版本行 id 也接受：编辑器 `?v=` 的 fork 态拿到的就是版本行 id，而上传发生在
 * 保存草稿之前，这里只写文件，不触碰版本行的不可变语义。
 */
export async function uploadForbiddenSymbol(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  const file = (ctx as Context & { file?: { buffer: Buffer } }).file;
  if (!file) {
    throw puzzleService.forbiddenSymbolRequired();
  }
  success(ctx, await puzzleService.uploadForbiddenSymbol(id, file.buffer), '上传成功');
}
