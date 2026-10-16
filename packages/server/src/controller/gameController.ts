import type { Context } from 'koa';
import { idParamSchema } from '@loredoku/shared';
import { success } from '../utils/response';
import { parseOrThrow } from '../utils/validate';
import * as gameService from '../service/gameService';

/**
 * FEAT-G02 (docs/v0.4.0.md §5.4): deploy a published work as a game.
 *
 * The full body (name / cover / difficulty) is validated by the shared
 * `gameDeploySchema` inside the service — that is where the difficulty default
 * and the "name falls back to the map name" rule live, so the controller only
 * forwards the parsed object.
 */
export async function deploy(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  const body = (ctx.request.body ?? {}) as Parameters<typeof gameService.deployGame>[1];
  const game = await gameService.deployGame(id, body);
  success(ctx, game, '部署成功');
}

/** The games home page: every deployed game across all maps, newest first. */
export async function list(ctx: Context): Promise<void> {
  success(ctx, await gameService.listGames());
}

export async function detail(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  success(ctx, await gameService.getGame(id));
}

export async function uploadCover(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  const file = (ctx as Context & { file?: { buffer: Buffer } }).file;
  if (!file) {
    throw gameService.coverRequired();
  }
  success(ctx, await gameService.uploadGameCover(id, file.buffer), '封面上传成功');
}
