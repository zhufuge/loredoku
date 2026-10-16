import type { Context } from 'koa';
import {
  createPuzzleSchema,
  idParamSchema,
  savePuzzleDraftSchema,
  updatePuzzleSchema,
} from '@loredoku/shared';
import { success } from '../utils/response';
import { parseOrThrow } from '../utils/validate';
import * as puzzleService from '../service/puzzleService';

/**
 * FEAT-K01 (docs/v0.5.0.md §2.2): the puzzle module's HTTP layer. Every handler
 * is a thin wrapper — the rules (published version required, immutable
 * reference, cross-table linkage check) live in `puzzleService`.
 */

export async function list(ctx: Context): Promise<void> {
  success(ctx, await puzzleService.listPuzzles());
}

export async function create(ctx: Context): Promise<void> {
  const body = parseOrThrow(createPuzzleSchema, ctx.request.body ?? {});
  success(ctx, await puzzleService.createPuzzle(body), '创建成功');
}

export async function detail(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  success(ctx, await puzzleService.getPuzzle(id));
}

/** §5.1: the read-only canvas the puzzle draws on (no palette — Q16). */
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
