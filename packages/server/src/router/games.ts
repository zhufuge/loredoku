import Router from '@koa/router';
import * as controller from '../controller/gameController';
import { gameCoverUpload } from '../middleware/upload';

/**
 * FEAT-G02 (docs/v0.4.0.md §5.4): deployed games live across every map, so
 * `/api/games` is a flat listing — the same shape as `/api/versions` for works.
 */
export const gamesRouter = new Router();

gamesRouter.get('/', controller.list);
/**
 * OPT-W04 §4.6: `/slug/:slug` is registered **before** `/:id` — otherwise the
 * `slug` segment would be matched by `/:id` and rejected as a non-numeric id.
 */
gamesRouter.get('/slug/:slug', controller.detailBySlug);
gamesRouter.get('/:id', controller.detail);
gamesRouter.post('/:id/cover', gameCoverUpload.single('file'), controller.uploadCover);
/** v0.7.1 §7.4: 取消部署（假删），玩家端与工坊「部署」模块共用同一份列表。 */
gamesRouter.delete('/:id', controller.remove);
