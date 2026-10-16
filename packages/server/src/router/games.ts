import Router from '@koa/router';
import * as controller from '../controller/gameController';
import { gameCoverUpload } from '../middleware/upload';

/**
 * FEAT-G02 (docs/v0.4.0.md §5.4): deployed games live across every map, so
 * `/api/games` is a flat listing — the same shape as `/api/versions` for works.
 */
export const gamesRouter = new Router();

gamesRouter.get('/', controller.list);
gamesRouter.get('/:id', controller.detail);
gamesRouter.post('/:id/cover', gameCoverUpload.single('file'), controller.uploadCover);
