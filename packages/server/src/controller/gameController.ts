import type { Context } from 'koa';
import { gameSlugParamSchema, idParamSchema } from '@loredoku/shared';
import { success } from '../utils/response';
import { parseOrThrow } from '../utils/validate';
import * as gameService from '../service/gameService';

/**
 * CONS-K16 (docs/v0.5.0.md §10.2): deploy a **puzzle** as a game
 * (`POST /api/puzzles/:id/games`). v0.5.0 moved deployment off the map version
 * because the puzzle is what owns the participants a game plays with.
 *
 * The full body (name / cover / difficulty) is validated by the shared
 * `gameDeploySchema` inside the service — that is where the difficulty default
 * and the "name falls back to the puzzle name" rule live, so the controller
 * only forwards the parsed object.
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

/** OPT-W04 §4.6: the game page's data source — resolve by access path. */
export async function detailBySlug(ctx: Context): Promise<void> {
  const { slug } = parseOrThrow(gameSlugParamSchema, ctx.params);
  success(ctx, await gameService.getGameBySlug(slug));
}

export async function uploadCover(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  const file = (ctx as Context & { file?: { buffer: Buffer } }).file;
  if (!file) {
    throw gameService.coverRequired();
  }
  success(ctx, await gameService.uploadGameCover(id, file.buffer), '封面上传成功');
}

/**
 * v0.8.5：部署页就地改权重。body 只有 `{ sortWeight }`，校验在 service ——
 * 控制器把整个 body 原样交过去，同 `deploy` 的做法。
 */
export async function updateSortWeight(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  success(ctx, await gameService.updateGameSortWeight(id, ctx.request.body ?? {}), '顺序已更新');
}

/** §7.4: 取消部署 = 假删（链接立刻失效，slug 可复用）。 */
export async function remove(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  await gameService.cancelGame(id);
  success(ctx, null, '已取消部署');
}
